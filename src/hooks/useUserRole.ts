import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { UserRole } from '../lib/types';
import useCompanies from './useCompanies';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { withRetry } from '../utils/helpers';

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
  const queryClient = useQueryClient();

  // Query for user's role in the program
  const userRoleQuery = useQuery({
    queryKey: ['userRole', programId, user?.id],
    queryFn: async () => {
      if (!user || !programId) return null;

      const { data, error } = await withRetry(() => 
        supabase
          .from('pilot_program_users')
          .select('role')
          .eq('program_id', programId)
          .eq('user_id', user.id)
          .maybeSingle()
      );

      if (error) throw error;
      return data?.role as UserRole | null;
    },
    enabled: !!user && !!programId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Query for company admin status for this program
  const companyAdminForProgramQuery = useQuery({
    queryKey: ['isCompanyAdminForProgram', programId, user?.id],
    queryFn: async () => {
      if (!user || !programId || !isCompanyAdmin) return false;
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('is_company_admin_for_program', { program_id_param: programId })
      );
      
      if (error) throw error;
      return !!data;
    },
    enabled: !!user && !!programId && !!isCompanyAdmin,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Refresh role function
  const refreshRole = async () => {
    await Promise.all([
      queryClient.invalidateQueries(['userRole', programId, user?.id]),
      queryClient.invalidateQueries(['isCompanyAdminForProgram', programId, user?.id])
    ]);
  };

  // Derived state for role-based permissions
  const role = userRoleQuery.data;
  const isAdmin = role === 'Admin';
  const isEditor = role === 'Edit';
  const isResponder = role === 'Respond';
  const isReadOnly = role === 'ReadOnly';
  const isCompanyAdminForProgram = companyAdminForProgramQuery.data || false;

  // Loading and error states
  const isLoading = userRoleQuery.isLoading || companyAdminForProgramQuery.isLoading;
  const error = userRoleQuery.error 
    ? `Failed to fetch user role: ${String(userRoleQuery.error)}` 
    : companyAdminForProgramQuery.error 
      ? `Failed to check company admin status: ${String(companyAdminForProgramQuery.error)}` 
      : null;

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
    refreshRole
  };
};

export default useUserRole;