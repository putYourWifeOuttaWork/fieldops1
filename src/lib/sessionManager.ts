import { supabase } from './supabaseClient';
import { 
  SubmissionSession, 
  SessionStatus, 
  InitialSubmissionData,
  CreateSessionResponse,
  ActiveSession
} from '../types/session';
import { PetriDefaults, GasifierDefaults, Submission } from './types';
import { toast } from 'react-toastify';
import { format, set, isAfter, endOfDay } from 'date-fns';

/**
 * Creates a new submission session with the provided data
 */
export const createSubmissionSession = async (
  siteId: string,
  programId: string,
  submissionData: InitialSubmissionData,
  petriTemplates?: PetriDefaults[],
  gasifierTemplates?: GasifierDefaults[]
): Promise<CreateSessionResponse> => {
  try {
    // Convert template arrays to JSON for the database function
    const petriTemplatesJson = petriTemplates ? JSON.stringify(petriTemplates) : null;
    const gasifierTemplatesJson = gasifierTemplates ? JSON.stringify(gasifierTemplates) : null;
    
    console.log('Creating session with templates:', {
      petriTemplates: petriTemplatesJson ? `(${petriTemplates?.length} templates)` : 'none',
      gasifierTemplates: gasifierTemplatesJson ? `(${gasifierTemplates?.length} templates)` : 'none'
    });
    
    const { data, error } = await supabase.rpc('create_submission_session', {
      p_site_id: siteId,
      p_program_id: programId,
      p_submission_data: submissionData,
      p_petri_templates: petriTemplatesJson,
      p_gasifier_templates: gasifierTemplatesJson
    });

    if (error) {
      console.error('Error creating submission session:', error);
      return {
        success: false,
        message: error.message
      };
    }

    console.log('Session created successfully:', data);
    return data as CreateSessionResponse;
  } catch (err) {
    console.error('Error in createSubmissionSession:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Unknown error occurred'
    };
  }
};

/**
 * Updates a submission session's activity timestamp
 */
export const updateSessionActivity = async (sessionId: string): Promise<boolean> => {
  try {
    // Check if session is already expired before updating
    const { data: sessionData, error: sessionError } = await supabase
      .from('submission_sessions')
      .select('session_start_time, session_status')
      .eq('session_id', sessionId)
      .single();

    if (sessionError) {
      console.error('Error checking session status:', sessionError);
      return false;
    }

    // If session is already completed, cancelled, or expired, don't update
    if (['Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete'].includes(sessionData.session_status)) {
      console.log(`Session ${sessionId} is ${sessionData.session_status}, not updating activity`);
      return false;
    }

    // Check if session is expired but not marked as such
    const sessionStartTime = new Date(sessionData.session_start_time);
    const expirationTime = set(sessionStartTime, { hours: 23, minutes: 59, seconds: 59 });
    const now = new Date();

    if (isAfter(now, expirationTime)) {
      console.log(`Session ${sessionId} has expired, updating status`);
      // Update session status to the appropriate Expired status based on completion
      const { data: sessionDetails } = await supabase
        .from('submission_sessions')
        .select('percentage_complete')
        .eq('session_id', sessionId)
        .single();
        
      const newStatus = sessionDetails?.percentage_complete === 100 
        ? 'Expired-Complete' 
        : 'Expired-Incomplete';
        
      // Update session status
      const { error: updateError } = await supabase
        .from('submission_sessions')
        .update({
          session_status: newStatus,
          last_activity_time: now.toISOString()
        })
        .eq('session_id', sessionId);

      if (updateError) {
        console.error('Error updating expired session:', updateError);
        return false;
      }
      return true;
    }

    // If not expired, update activity time normally
    const { data, error } = await supabase.rpc('update_submission_session_activity', {
      p_session_id: sessionId
    });

    if (error) {
      console.error('Error updating session activity:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in updateSessionActivity:', err);
    return false;
  }
};

/**
 * Completes a submission session
 */
export const completeSubmissionSession = async (sessionId: string): Promise<any> => {
  try {
    const { data, error } = await supabase.rpc('complete_submission_session', {
      p_session_id: sessionId
    });

    if (error) {
      console.error('Error completing submission session:', error);
      toast.error(`Failed to complete submission: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Failed to complete submission'
      };
    }

    // Return the entire data object, which includes success, message, and session properties
    return data;
  } catch (err) {
    console.error('Error in completeSubmissionSession:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'An error occurred while completing the submission'
    };
  }
};

/**
 * Cancels a submission session
 */
export const cancelSubmissionSession = async (sessionId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('cancel_submission_session', {
      p_session_id: sessionId
    });
        
    if (error) {
      console.error('Error cancelling submission session:', error);
      toast.error(`Failed to cancel submission: ${error.message}`);
      return false;
    }
      
    if (!data.success) {
      toast.error(data.message || 'Failed to cancel submission');
      return false;
    }
      
    return data;
  } catch (err) {
    console.error('Error in cancelSubmissionSession:', err);
    toast.error('Error cancelling submission');
    return false;
  }
};

/**
 * Shares a submission session with other users
 */
export const shareSubmissionSession = async (
  sessionId: string, 
  userIds: string[], 
  actionType: 'share' | 'escalate' = 'share'
): Promise<any> => {
  try {
    const { data, error } = await supabase.rpc('share_submission_session', {
      p_session_id: sessionId,
      p_user_ids: userIds,
      p_action_type: actionType
    });

    if (error) {
      console.error('Error sharing submission session:', error);
      toast.error(`Failed to share submission: ${error.message}`);
      return { success: false, message: error.message };
    }

    if (!data.success) {
      toast.error(data.message || 'Failed to share submission');
      return { success: false, message: data.message };
    }

    return { success: true, message: 'Session shared successfully', session: data.session };
  } catch (err) {
    console.error('Error in shareSubmissionSession:', err);
    toast.error('An error occurred while sharing the submission');
    return { success: false, message: 'An unexpected error occurred' };
  }
};

/**
 * Escalates a submission session to a site admin
 */
export const escalateSubmissionSession = async (sessionId: string, programId: string): Promise<any> => {
  try {
    // First, get the admin user ID for this program
    const { data: adminData, error: adminError } = await supabase.rpc('get_program_admin_user_id', {
      p_program_id: programId
    });
    
    if (adminError) {
      console.error('Error getting admin user ID:', adminError);
      return { success: false, message: 'Failed to find an admin for this program' };
    }
    
    if (!adminData) {
      return { success: false, message: 'No admin found for this program' };
    }
    
    // Now share the session with the admin, specifically using the 'escalate' action type
    const result = await shareSubmissionSession(sessionId, [adminData], 'escalate');
    
    // If sharing was successful, add additional context
    if (result.success) {
      result.isEscalated = true;
      result.adminUserId = adminData;
    }
    
    return result;
  } catch (err) {
    console.error('Error in escalateSubmissionSession:', err);
    toast.error('An error occurred while escalating the submission');
    return { success: false, message: 'An unexpected error occurred' };
  }
};

/**
 * Fetches all active sessions for the current user
 */
export const getActiveSessions = async (): Promise<ActiveSession[]> => {
  try {
    // Use the RPC function that handles the complex joins correctly
    const { data, error } = await supabase.rpc('get_active_sessions_with_details');

    if (error) {
      console.error('Error getting active sessions:', error);
      throw error;
    }

    // The RPC function already returns data in the format we need
    return data || [];
  } catch (err) {
    console.error('Error in getActiveSessions:', err);
    throw err;
  }
};

/**
 * Fetches a specific session by ID
 */
export const getSessionById = async (sessionId: string): Promise<SubmissionSession | null> => {
  try {
    const { data, error } = await supabase
      .from('submission_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      console.error('Error getting session by ID:', error);
      return null;
    }

    return data as SubmissionSession;
  } catch (err) {
    console.error('Error in getSessionById:', err);
    return null;
  }
};

/**
 * Fetches a submission with session data
 */
export const getSubmissionWithSession = async (submissionId: string): Promise<{
  submission: Submission | null;
  session: SubmissionSession | null;
  creator?: { id: string; email: string; full_name: string | null } | null;
}> => {
  try {
    // Get the submission with creator details
    const { data: submissionWithCreator, error: creatorError } = await supabase
      .rpc('get_submission_with_creator', {
        submission_id_param: submissionId
      });
      
    if (creatorError) {
      console.error('Error getting submission with creator:', creatorError);
      
      // Fall back to just getting the submission without creator details
      const { data: submissionData, error: submissionError } = await supabase
        .from('submissions')
        .select('*')
        .eq('submission_id', submissionId)
        .single();
        
      if (submissionError) {
        console.error('Error getting submission:', submissionError);
        return { submission: null, session: null };
      }
      
      // Check if the submission has a session
      const { data: sessionData, error: sessionError } = await supabase
        .from('submission_sessions')
        .select('*')
        .eq('submission_id', submissionId)
        .maybeSingle();

      if (sessionError && !sessionError.message.includes('No rows found')) {
        console.error('Error getting session:', sessionError);
      }
      
      return { 
        submission: submissionData as Submission, 
        session: sessionData as SubmissionSession,
        creator: null
      };
    }
    
    // If we successfully got submission with creator
    if (submissionWithCreator) {
      // Extract creator details
      const creator = submissionWithCreator.creator;
      
      // Extract the submission data (excluding the creator property)
      const { creator: _, ...submissionData } = submissionWithCreator;
      
      // Check if the submission has a session
      const { data: sessionData, error: sessionError } = await supabase
        .from('submission_sessions')
        .select('*')
        .eq('submission_id', submissionId)
        .maybeSingle();

      if (sessionError && !sessionError.message.includes('No rows found')) {
        console.error('Error getting session:', sessionError);
      }

      // If session exists but might be expired, check expiration
      if (sessionData && !['Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete'].includes(sessionData.session_status)) {
        const sessionStartTime = new Date(sessionData.session_start_time);
        const expirationTime = set(sessionStartTime, { hours: 23, minutes: 59, seconds: 59 });
        const now = new Date();

        // If past expiration time, update session to appropriate Expired status
        if (isAfter(now, expirationTime)) {
          console.log(`Session ${sessionData.session_id} has expired, updating status`);
          
          // Set to Expired-Complete if 100% complete, otherwise Expired-Incomplete
          const newStatus = sessionData.percentage_complete === 100 
            ? 'Expired-Complete' 
            : 'Expired-Incomplete';
          
          const { data: updatedSession, error: updateError } = await supabase
            .from('submission_sessions')
            .update({
              session_status: newStatus,
              last_activity_time: now.toISOString()
            })
            .eq('session_id', sessionData.session_id)
            .select('*')
            .single();
            
          if (updateError) {
            console.error('Error updating expired session:', updateError);
            // Still return the session with original status
            return { 
              submission: submissionData as Submission, 
              session: sessionData as SubmissionSession,
              creator
            };
          }
          
          // Return submission with updated session
          return { 
            submission: submissionData as Submission, 
            session: updatedSession as SubmissionSession,
            creator
          };
        }
      }
        
      return { 
        submission: submissionData as Submission, 
        session: sessionData as SubmissionSession,
        creator
      };
    }
    
    return { submission: null, session: null, creator: null };
  } catch (err) {
    console.error('Error in getSubmissionWithSession:', err);
    return { submission: null, session: null };
  }
};

/**
 * Calculate expiration time for a session (11:59:59 PM of the start day)
 */
export const calculateSessionExpiration = (sessionStartTime: string): Date => {
  const startDate = new Date(sessionStartTime);
  return set(startDate, { hours: 23, minutes: 59, seconds: 59 });
};

/**
 * Check if a session is expired based on its start time
 */
export const isSessionExpired = (sessionStartTime: string): boolean => {
  const expirationTime = calculateSessionExpiration(sessionStartTime);
  const now = new Date();
  return isAfter(now, expirationTime);
};

/**
 * Format expiration time for display
 */
export const formatExpirationTime = (sessionStartTime: string): string => {
  const expirationTime = calculateSessionExpiration(sessionStartTime);
  return format(expirationTime, 'PPp');
};

export default {
  createSubmissionSession,
  updateSessionActivity,
  completeSubmissionSession,
  cancelSubmissionSession,
  shareSubmissionSession,
  escalateSubmissionSession,
  getActiveSessions,
  getSessionById,
  getSubmissionWithSession,
  calculateSessionExpiration,
  isSessionExpired,
  formatExpirationTime
};