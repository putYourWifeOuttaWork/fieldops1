import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { PilotProgram } from '../lib/types';
import { toast } from 'react-toastify';

interface UsePilotProgramsResult {
  programs: PilotProgram[];
  isLoading: boolean;
  error: string | null;
  refetchPrograms: () => Promise<void>;
  createProgram: (programData: Omit<PilotProgram, 'program_id' | 'total_submissions' | 'total_sites' | 'created_at' | 'updated_at'>) => Promise<PilotProgram | null>;
  updateProgram: (programId: string, programData: Partial<PilotProgram>) => Promise<PilotProgram | null>;
  deleteProgram: (programId: string) => Promise<boolean>;
  fetchPilotProgram: (programId: string) => Promise<PilotProgram | null>;
}

export const usePilotPrograms = (): UsePilotProgramsResult => {
  const { user } = useAuthStore();
  const [programs, setPrograms] = useState<PilotProgram[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrograms = useCallback(async () => {
    if (!user) {
      setPrograms([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Query the pilot_programs table directly
      // RLS policies will filter this to show only programs the user has access to:
      // - Programs where the user is directly added via pilot_program_users
      // - Programs belonging to the user's company
      const { data, error: fetchError } = await supabase
        .from('pilot_programs')
        .select('*')
        .order('name');
        
      if (fetchError) throw fetchError;
      
      if (data) {
        setPrograms(data);
      }
    } catch (err) {
      console.error('Error fetching pilot programs:', err);
      setError('Failed to fetch pilot programs');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const fetchPilotProgram = async (programId: string): Promise<PilotProgram | null> => {
    try {
      // Check if the user has access to this program
      const { data, error } = await supabase
        .from('pilot_programs')
        .select('*')
        .eq('program_id', programId)
        .single();
        
      if (error) {
        console.error('Error fetching pilot program:', error);
        return null;
      }
      
      return data;
    } catch (err) {
      console.error('Error fetching pilot program:', err);
      return null;
    }
  };

  const createProgram = async (programData: Omit<PilotProgram, 'program_id' | 'total_submissions' | 'total_sites' | 'created_at' | 'updated_at'>): Promise<PilotProgram | null> => {
    try {
      // Calculate status based on date range
      const today = new Date();
      const startDate = new Date(programData.start_date);
      const endDate = new Date(programData.end_date);
      
      const calculatedStatus = 
        (today >= startDate && today <= endDate) ? 'active' : 'inactive';
      
      // Insert new pilot program
      const { data, error } = await supabase
        .from('pilot_programs')
        .insert({
          ...programData,
          status: calculatedStatus,
          total_submissions: 0,
          total_sites: 0
        })
        .select()
        .single();
        
      if (error) {
        console.error('Program creation error:', error);
        toast.error(`Failed to create program: ${error.message}`);
        return null;
      }
      
      // The creator is automatically made an Admin via database trigger
      
      // Update local state
      await fetchPrograms();
      
      return data;
    } catch (err) {
      console.error('Error creating program:', err);
      toast.error('Failed to create program');
      return null;
    }
  };

  const updateProgram = async (programId: string, programData: Partial<PilotProgram>): Promise<PilotProgram | null> => {
    try {
      const { data, error } = await supabase
        .from('pilot_programs')
        .update(programData)
        .eq('program_id', programId)
        .select()
        .single();
        
      if (error) {
        console.error('Program update error:', error);
        toast.error(`Failed to update program: ${error.message}`);
        return null;
      }
      
      // Update local state
      setPrograms(prev => prev.map(p => 
        p.program_id === programId ? data : p
      ));
      
      return data;
    } catch (err) {
      console.error('Error updating program:', err);
      toast.error('Failed to update program');
      return null;
    }
  };

  const deleteProgram = async (programId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('pilot_programs')
        .delete()
        .eq('program_id', programId);
        
      if (error) {
        console.error('Program deletion error:', error);
        toast.error(`Failed to delete program: ${error.message}`);
        return false;
      }
      
      // Update local state
      setPrograms(prev => prev.filter(p => p.program_id !== programId));
      
      return true;
    } catch (err) {
      console.error('Error deleting program:', err);
      toast.error('Failed to delete program');
      return false;
    }
  };

  return {
    programs,
    isLoading,
    error,
    refetchPrograms: fetchPrograms,
    createProgram,
    updateProgram,
    deleteProgram,
    fetchPilotProgram
  };
};

export default usePilotPrograms;