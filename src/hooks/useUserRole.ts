import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { UserRole } from '../lib/types';
import useCompanies from './useCompanies';

interface UseUserRoleProps {
  programId?: string;
}

interface UseUserRoleResult {
  role: UserRole | null;
  isAdmin: boolean;
  isEditor: boolean;
  isResponder: boolean;
  isReadOnly: boolean;
  isLoading: boolean;
  error: string | null;
  canCreateProgram: boolean;
  canEditProgram: boolean;
  canDeleteProgram: boolean;
  canCreateSite: boolean;
  canEditSite: boolean;
  canDeleteSite: boolean;
  canCreateSubmission: boolean;
  canEditSubmission: boolean;
  canDeleteSubmission: boolean;
  canManageUsers: boolean;
  canViewAuditLog: boolean;
  canManageSiteTemplates: boolean;
  isCompanyAdminForProgram: boolean;
  refreshRole: () => Promise<void>;
}

export const useUserRole = ({ programId }: UseUserRoleProps = {}): UseUserRoleResult => {
  const { user } = useAuthStore();
  const { isAdmin: isCompanyAdmin } = useCompanies();
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!programId);
  const [error, setError] = useState<string | null>(null);
  const [isCompanyAdminForProgram, setIsCompanyAdminForProgram] = useState<boolean>(false);

  const fetchUserRole = async () => {
    if (!user || !programId) {
      setRole(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: roleError } = await supabase
        .from('pilot_program_users')
        .select('role')
        .eq('program_id', programId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (roleError) {
        console.error('Error fetching user role:', roleError);
        setError('Failed to fetch user role');
        setRole(null);
      } else if (data) {
        setRole(data.role as UserRole);
      } else {
        setRole(null);
      }

      // Check if user is a company admin for this program's company
      if (isCompanyAdmin) {
        const { data: isAdmin } = await supabase
          .rpc('is_company_admin_for_program', { program_id_param: programId });
        
        setIsCompanyAdminForProgram(!!isAdmin);
      } else {
        setIsCompanyAdminForProgram(false);
      }
    } catch (err) {
      console.error('Error in fetchUserRole:', err);
      setError('An unexpected error occurred');
      setRole(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserRole();
  }, [user, programId, isCompanyAdmin]);

  // Derived state for role-based permissions
  const isAdmin = role === 'Admin';
  const isEditor = role === 'Edit';
  const isResponder = role === 'Respond';
  const isReadOnly = role === 'ReadOnly';

  // Permission checks
  const canCreateProgram = !!user; // Any authenticated user can create a program
  const canEditProgram = isAdmin || isCompanyAdminForProgram;
  const canDeleteProgram = isAdmin || isCompanyAdminForProgram;
  
  const canCreateSite = isAdmin || isEditor || isCompanyAdminForProgram;
  const canEditSite = isAdmin || isEditor || isCompanyAdminForProgram;
  const canDeleteSite = isAdmin || isEditor || isCompanyAdminForProgram;
  
  const canCreateSubmission = isAdmin || isEditor || isResponder;
  const canEditSubmission = isAdmin || isEditor || isCompanyAdminForProgram;
  const canDeleteSubmission = isAdmin || isEditor || isCompanyAdminForProgram;
  
  const canManageUsers = isAdmin || isCompanyAdminForProgram;
  const canViewAuditLog = isAdmin || isCompanyAdminForProgram;
  
  // New permission for managing site templates
  const canManageSiteTemplates = isAdmin || isEditor || isCompanyAdminForProgram;

  return {
    role,
    isAdmin,
    isEditor,
    isResponder,
    isReadOnly,
    isLoading,
    error,
    canCreateProgram,
    canEditProgram,
    canDeleteProgram,
    canCreateSite,
    canEditSite,
    canDeleteSite,
    canCreateSubmission,
    canEditSubmission,
    canDeleteSubmission,
    canManageUsers,
    canViewAuditLog,
    canManageSiteTemplates,
    isCompanyAdminForProgram,
    refreshRole: fetchUserRole
  };
};

export default useUserRole;