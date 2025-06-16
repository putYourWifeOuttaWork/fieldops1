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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { withRetry, fetchSubmissionsBySiteId } from '../lib/api';

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
  const queryClient = useQueryClient();

  // Use React Query for fetching submissions
  const submissionsQuery = useQuery({
    queryKey: ['submissions', siteId],
    queryFn: async () => {
      if (!siteId) return [];
      
      const { data, error } = await fetchSubmissionsBySiteId(siteId);
      
      if (error) {
        throw error;
      }
      
      // Format the data
      return data?.map(sub => ({
        ...sub,
        petri_count: Number(sub.petri_count) || 0,
        gasifier_count: Number(sub.gasifier_count) || 0,
        global_submission_id: Number(sub.global_submission_id) || 0
      })) || [];
    },
    enabled: !!siteId,
    keepPreviousData: true,
    refetchOnWindowFocus: false
  });

  // Update the local state whenever the query data changes
  useEffect(() => {
    if (submissionsQuery.data) {
      setSubmissions(submissionsQuery.data);
    }
    
    setLoading(submissionsQuery.isLoading);
    setError(submissionsQuery.error ? String(submissionsQuery.error) : null);
  }, [submissionsQuery.data, submissionsQuery.isLoading, submissionsQuery.error]);

  // Memoized fetchSubmissions with useCallback
  const fetchSubmissions = useCallback(async () => {
    if (!siteId) return;
    
    // Refetch using React Query instead of manual fetching
    await queryClient.refetchQueries({ queryKey: ['submissions', siteId] });
  }, [siteId, queryClient]);

  // Use React Query for fetching petri observations
  const fetchSubmissionPetriObservations = useCallback(async (submissionId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Check cache first
      const cachedData = queryClient.getQueryData<PetriObservation[]>(['petriObservations', submissionId]);
      
      if (cachedData) {
        setLoading(false);
        return cachedData;
      }
      
      // Fetch with retry logic
      const { data, error } = await withRetry(() => 
        supabase
          .from('petri_observations')
          .select('*')
          .eq('submission_id', submissionId)
      );
      
      if (error) throw error;
      
      // Cache the result
      queryClient.setQueryData(['petriObservations', submissionId], data);
      
      return data || [];
    } catch (err) {
      console.error('Error fetching petri observations:', err);
      setError('Failed to load petri observations');
      return [];
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  // Use React Query for fetching gasifier observations
  const fetchSubmissionGasifierObservations = useCallback(async (submissionId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Check cache first
      const cachedData = queryClient.getQueryData<GasifierObservation[]>(['gasifierObservations', submissionId]);
      
      if (cachedData) {
        setLoading(false);
        return cachedData;
      }
      
      // Fetch with retry logic
      const { data, error } = await withRetry(() => 
        supabase
          .from('gasifier_observations')
          .select('*')
          .eq('submission_id', submissionId)
      );
      
      if (error) throw error;
      
      // Cache the result
      queryClient.setQueryData(['gasifierObservations', submissionId], data);
      
      return data || [];
    } catch (err) {
      console.error('Error fetching gasifier observations:', err);
      setError('Failed to load gasifier observations');
      return [];
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  // Create submission mutation
  const createSubmissionMutation = useMutation({
    mutationFn: async ({
      temperature,
      humidity,
      airflow,
      odorDistance,
      weather,
      notes,
      petriObservations,
      gasifierObservations,
      sid,
      indoorTemperature,
      indoorHumidity
    }: {
      temperature: number;
      humidity: number;
      airflow: 'Open' | 'Closed';
      odorDistance: '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft';
      weather: 'Clear' | 'Cloudy' | 'Rain';
      notes: string | null;
      petriObservations: PetriFormData[];
      gasifierObservations: GasifierFormData[];
      sid?: string;
      indoorTemperature?: number | null;
      indoorHumidity?: number | null;
    }) => {
      const id = sid || siteId;
      if (!id || !user) throw new Error('Site ID and user are required');
      
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
        
        return offlineSubmission;
      }
      
      // Create submission with retry logic
      const { data, error: submissionError } = await withRetry(() => 
        supabase
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
          .single()
      );
      
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
      
      return {
        ...data,
        updatedPetriObservations: petriResult.updatedObservations,
        updatedGasifierObservations: gasifierResult.updatedObservations
      };
    },
    onSuccess: () => {
      // Invalidate and refetch submissions query to update the list
      queryClient.invalidateQueries(['submissions', siteId]);
      toast.success('Submission created successfully!');
    },
    onError: (error) => {
      console.error('Error creating submission:', error);
      toast.error('Failed to create submission. Please try again.');
    }
  });

  const createSubmission = useCallback(async (
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
    try {
      return await createSubmissionMutation.mutateAsync({
        temperature,
        humidity,
        airflow,
        odorDistance,
        weather,
        notes,
        petriObservations,
        gasifierObservations,
        sid,
        indoorTemperature,
        indoorHumidity
      });
    } catch (error) {
      return null;
    }
  }, [createSubmissionMutation]);

  // Update submission mutation
  const updateSubmissionMutation = useMutation({
    mutationFn: async ({
      submissionId,
      temperature,
      humidity,
      airflow,
      odorDistance,
      weather,
      notes,
      petriObservations,
      gasifierObservations,
      indoorTemperature,
      indoorHumidity
    }: {
      submissionId: string;
      temperature: number;
      humidity: number;
      airflow: 'Open' | 'Closed';
      odorDistance: '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft';
      weather: 'Clear' | 'Cloudy' | 'Rain';
      notes: string | null;
      petriObservations: PetriFormData[];
      gasifierObservations: GasifierFormData[];
      indoorTemperature?: number | null;
      indoorHumidity?: number | null;
    }) => {
      if (!submissionId) throw new Error('Submission ID is required');
      
      // Update existing submission with retry logic
      const { data, error } = await withRetry(() => 
        supabase
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
          .single()
      );
      
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
      
      // Return the submission data along with the updated observation IDs
      return {
        ...data,
        updatedPetriObservations: petriResult.updatedObservations,
        updatedGasifierObservations: gasifierResult.updatedObservations
      };
    },
    onSuccess: (data) => {
      // Invalidate and refetch queries to update the data
      queryClient.invalidateQueries(['submissions', siteId]);
      queryClient.invalidateQueries(['submission', data.submission_id]);
      queryClient.invalidateQueries(['petriObservations', data.submission_id]);
      queryClient.invalidateQueries(['gasifierObservations', data.submission_id]);
      
      toast.success('Submission updated successfully!');
    },
    onError: (error) => {
      console.error('Error updating submission:', error);
      toast.error('Failed to update submission. Please try again.');
    }
  });

  const updateSubmission = useCallback(async (
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
    try {
      return await updateSubmissionMutation.mutateAsync({
        submissionId,
        temperature,
        humidity,
        airflow,
        odorDistance,
        weather,
        notes,
        petriObservations,
        gasifierObservations,
        indoorTemperature,
        indoorHumidity
      });
    } catch (error) {
      return null;
    }
  }, [updateSubmissionMutation]);

  // Delete submission mutation
  const deleteSubmissionMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      if (!submissionId) throw new Error('Submission ID is required');
      
      const { error } = await withRetry(() => 
        supabase
          .from('submissions')
          .delete()
          .eq('submission_id', submissionId)
      );
      
      if (error) throw error;
      
      return submissionId;
    },
    onSuccess: (submissionId) => {
      // Update local state
      setSubmissions(prevSubmissions => 
        prevSubmissions.filter(submission => submission.submission_id !== submissionId)
      );
      
      // Invalidate and refetch queries
      queryClient.invalidateQueries(['submissions', siteId]);
      queryClient.removeQueries(['submission', submissionId]);
      queryClient.removeQueries(['petriObservations', submissionId]);
      queryClient.removeQueries(['gasifierObservations', submissionId]);
      
      toast.success('Submission deleted successfully!');
    },
    onError: (error) => {
      console.error('Error deleting submission:', error);
      toast.error('Failed to delete submission. Please try again.');
    }
  });

  const deleteSubmission = useCallback(async (submissionId: string) => {
    try {
      await deleteSubmissionMutation.mutateAsync(submissionId);
      return true;
    } catch (error) {
      return false;
    }
  }, [deleteSubmissionMutation]);

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