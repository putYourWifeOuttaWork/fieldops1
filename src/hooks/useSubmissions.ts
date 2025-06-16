import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Submission, PetriObservation, GasifierObservation } from '../lib/types';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'react-toastify';
import offlineStorage from '../utils/offlineStorage';
import { useOnlineStatus } from './useOnlineStatus';
import { 
  updatePetriObservations, 
  updateGasifierObservations,
  PetriFormData,
  GasifierFormData
} from '../utils/submissionUtils';

interface SubmissionWithCounts extends Submission {
  petri_count: number;
  gasifier_count: number;
  petri_observations?: PetriObservation[];
  gasifier_observations?: GasifierObservation[];
}

export function useSubmissions(siteId?: string) {
  const { user } = useAuthStore();
  const [submissions, setSubmissions] = useState<SubmissionWithCounts[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  // Memoize fetchSubmissions with useCallback to prevent unnecessary re-creations
  const fetchSubmissions = useCallback(async (sid?: string) => {
    const id = sid || siteId;
    if (!id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Use the fetch_submissions_for_site function to get submissions with counts
      const { data: submissionsData, error: submissionsError } = await supabase
        .rpc('fetch_submissions_for_site', { p_site_id: id });
        
      if (submissionsError) throw submissionsError;
      
      // Format the data
      const formattedSubmissions = submissionsData.map(sub => ({
        ...sub,
        petri_count: Number(sub.petri_count) || 0,
        gasifier_count: Number(sub.gasifier_count) || 0,
        global_submission_id: Number(sub.global_submission_id) || 0
      }));
      
      setSubmissions(formattedSubmissions);
    } catch (err) {
      console.error('Error fetching submissions:', err);
      setError('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [siteId]); // Only depend on siteId, not on state setters which don't change

  const fetchSubmissionPetriObservations = useCallback(async (submissionId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch the petri observations for this submission
      const { data, error } = await supabase
        .from('petri_observations')
        .select('*')
        .eq('submission_id', submissionId);
        
      if (error) throw error;
      
      return data || [];
    } catch (err) {
      console.error('Error fetching petri observations:', err);
      setError('Failed to load petri observations');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSubmissionGasifierObservations = useCallback(async (submissionId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch the gasifier observations for this submission
      const { data, error } = await supabase
        .from('gasifier_observations')
        .select('*')
        .eq('submission_id', submissionId);
        
      if (error) throw error;
      
      return data || [];
    } catch (err) {
      console.error('Error fetching gasifier observations:', err);
      setError('Failed to load gasifier observations');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createSubmission = async (
    temperature: number,
    humidity: number,
    airflow: 'Open' | 'Closed',
    odorDistance: '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft',
    weather: 'Clear' | 'Cloudy' | 'Rain',
    notes: string | null,
    petriObservations: PetriFormData[],
    gasifierObservations: GasifierFormData[],
    sid?: string,
    indoorTemperature?: number | null,
    indoorHumidity?: number | null
  ) => {
    const id = sid || siteId;
    if (!id || !user) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      if (!isOnline) {
        // Store submission for offline sync
        const offlineSubmission = {
          submission_id: `offline-${Date.now()}`,
          site_id: id,
          program_id: '', // Will be set by trigger
          temperature,
          humidity,
          airflow,
          odor_distance: odorDistance,
          weather,
          notes,
          created_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          indoor_temperature: indoorTemperature,
          indoor_humidity: indoorHumidity
        } as Submission;

        // Store petri observations offline
        const offlinePetriObservations = petriObservations.map(p => ({
          ...p,
          submission_id: offlineSubmission.submission_id,
          site_id: id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })) as PetriObservation[];

        // Store gasifier observations offline
        const offlineGasifierObservations = gasifierObservations.map(g => ({
          ...g,
          submission_id: offlineSubmission.submission_id,
          site_id: id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })) as GasifierObservation[];

        await offlineStorage.saveSubmissionOffline(
          offlineSubmission,
          offlinePetriObservations,
          offlineGasifierObservations
        );
        
        toast.info('Submission saved locally and will sync when online');
        return offlineSubmission;
      }
      
      // Insert new submission
      const { data, error: submissionError } = await supabase
        .from('submissions')
        .insert({
          site_id: id,
          temperature,
          humidity,
          airflow,
          odor_distance: odorDistance,
          weather,
          notes,
          created_by: user.id,
          indoor_temperature: indoorTemperature,
          indoor_humidity: indoorHumidity
        })
        .select()
        .single();
        
      if (submissionError) throw submissionError;

      // Filter valid form data
      const validPetriForms = petriObservations.filter(p => p.hasData);
      const validGasifierForms = gasifierObservations.filter(g => g.hasData);
      
      // Process petri observations
      const petriResult = await updatePetriObservations(validPetriForms, data.submission_id, id);
      
      // Process gasifier observations
      const gasifierResult = await updateGasifierObservations(validGasifierForms, data.submission_id, id);
      
      // If either operation failed, log error but still return data
      if (!petriResult.success || !gasifierResult.success) {
        console.warn('Some observations may not have been updated correctly');
      }
      
      toast.success('Submission created successfully!');
      await fetchSubmissions();
      
      return {
        ...data,
        updatedPetriObservations: petriResult.updatedObservations,
        updatedGasifierObservations: gasifierResult.updatedObservations
      };
    } catch (err) {
      console.error('Error creating submission:', err);
      setError('Failed to create submission');
      toast.error('Failed to create submission. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateSubmission = async (
    submissionId: string,
    temperature: number,
    humidity: number,
    airflow: 'Open' | 'Closed',
    odorDistance: '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft',
    weather: 'Clear' | 'Cloudy' | 'Rain',
    notes: string | null,
    petriObservations: PetriFormData[],
    gasifierObservations: GasifierFormData[],
    indoorTemperature?: number | null,
    indoorHumidity?: number | null
  ) => {
    if (!submissionId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      // First, check the current session status
      const { data: sessionData, error: sessionError } = await supabase
        .from('submission_sessions')
        .select('session_status')
        .eq('submission_id', submissionId)
        .maybeSingle();
        
      if (sessionError) {
        console.error('Error fetching session status:', sessionError);
      }
      
      // Determine if this is an initial session where we can create new observations
      const sessionStatus = sessionData?.session_status;
      const isInitialSession = !sessionStatus || sessionStatus === 'Opened';
      
      console.log(`Session status: ${sessionStatus}, isInitialSession: ${isInitialSession}`);
      
      // Update existing submission
      const { data, error } = await supabase
        .from('submissions')
        .update({
          temperature,
          humidity,
          airflow,
          odor_distance: odorDistance,
          weather,
          notes,
          indoor_temperature: indoorTemperature,
          indoor_humidity: indoorHumidity
        })
        .eq('submission_id', submissionId)
        .select()
        .single();
        
      if (error) throw error;

      // Get the site ID for this submission
      const siteId = data.site_id;

      // Filter observations based on whether they're dirty or have an observationId
      const validPetriForms = petriObservations.filter(p => p.observationId || p.isDirty);
      const validGasifierForms = gasifierObservations.filter(g => g.observationId || g.isDirty);
      
      // Process petri observations
      const petriResult = await updatePetriObservations(validPetriForms, data.submission_id, siteId);
      
      // Process gasifier observations
      const gasifierResult = await updateGasifierObservations(validGasifierForms, data.submission_id, siteId);
      
      // If either operation failed, log error but still return data
      if (!petriResult.success || !gasifierResult.success) {
        console.warn('Some observations may not have been updated correctly');
      }
      
      // Return the submission data along with the updated observation IDs
      const result = {
        ...data,
        updatedPetriObservations: petriResult.updatedObservations,
        updatedGasifierObservations: gasifierResult.updatedObservations
      };

      await fetchSubmissions();
      return result;
    } catch (err) {
      console.error('Error updating submission:', err);
      setError('Failed to update submission');
      toast.error('Failed to update submission. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Delete a submission
  const deleteSubmission = useCallback(async (submissionId: string) => {
    if (!submissionId) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('submission_id', submissionId);
        
      if (error) throw error;
      
      // Update local state by removing the deleted submission
      setSubmissions(prevSubmissions => 
        prevSubmissions.filter(submission => submission.submission_id !== submissionId)
      );
      
      toast.success('Submission deleted successfully!');
      return true;
    } catch (err) {
      console.error('Error deleting submission:', err);
      setError('Failed to delete submission');
      toast.error('Failed to delete submission. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load submissions when component mounts or siteId changes
  useEffect(() => {
    if (siteId) {
      console.log(`[useSubmissions] Loading submissions for siteId: ${siteId}`);
      fetchSubmissions();
    }
  }, [siteId, fetchSubmissions]);

  return {
    submissions,
    loading,
    error,
    fetchSubmissions,
    fetchSubmissionPetriObservations,
    fetchSubmissionGasifierObservations,
    createSubmission,
    updateSubmission,
    deleteSubmission
  };
}