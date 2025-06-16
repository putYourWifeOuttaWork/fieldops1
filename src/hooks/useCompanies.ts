import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'react-toastify';

export interface Company {
  company_id: string;
  name: string;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  default_weather: 'Clear' | 'Cloudy' | 'Rain';
}

export interface CompanyUser {
  id: string;
  email: string;
  full_name: string | null;
  is_company_admin: boolean;
  is_active: boolean;
}

export function useCompanies() {
  const { user } = useAuthStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [userCompany, setUserCompany] = useState<Company | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Add a new state variable to track if user company data has been loaded
  const [isUserCompanyLoaded, setIsUserCompanyLoaded] = useState(false);

  // Load the user's company and check if they're an admin
  useEffect(() => {
    const loadUserCompany = async () => {
      if (!user) {
        setUserCompany(null);
        setIsAdmin(false);
        setCanCreate(false);
        setLoading(false);
        // Reset the cache flag when user is null (on logout)
        setIsUserCompanyLoaded(false);
        return;
      }

      // If user company data is already loaded, return early
      if (isUserCompanyLoaded) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Use the RPC function to get company details
        const { data: companyData, error: companyError } = await supabase
          .rpc('get_user_company');

        if (companyError) throw companyError;

        if (companyData && companyData.has_company) {
          setUserCompany(companyData.company);
          setIsAdmin(companyData.is_admin);
        } else {
          setUserCompany(null);
          setIsAdmin(false);
        }

        // Check if user is a super admin
        const { data: superAdminData, error: superAdminError } = await supabase
          .rpc('is_super_admin');

        if (superAdminError) throw superAdminError;
        setIsSuperAdmin(!!superAdminData);

        // Check if user can create a company
        const { data: canCreateData, error: canCreateError } = await supabase
          .rpc('can_create_company');

        if (canCreateError) throw canCreateError;
        setCanCreate(!!canCreateData);

        // Set the cache flag to true after successfully loading data
        setIsUserCompanyLoaded(true);
      } catch (err) {
        console.error('Error loading company data:', err);
        setError('Failed to load company data');
      } finally {
        setLoading(false);
      }
    };

    loadUserCompany();
  }, [user, isUserCompanyLoaded]); // Add isUserCompanyLoaded to dependencies

  // Get all companies (only for super admins)
  const fetchAllCompanies = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (err) {
      console.error('Error fetching companies:', err);
      setError('Failed to fetch companies');
    } finally {
      setLoading(false);
    }
  };

  // Fetch users associated with a company - MEMOIZED with useCallback
  const fetchCompanyUsers = useCallback(async (companyId: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, is_company_admin, is_active')
        .eq('company_id', companyId)
        .order('is_active', { ascending: false })
        .order('full_name');

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching company users:', err);
      setError('Failed to fetch company users');
      return [];
    } finally {
      setLoading(false);
    }
  }, []); // No dependencies since it doesn't use any state or props

  // Create a new company
  const createCompany = async (companyData: Omit<Company, 'company_id' | 'created_at' | 'updated_at' | 'default_weather'>) => {
    setLoading(true);
    setError(null);

    try {
      // Check if user can create a company
      const { data: canCreateData, error: canCreateError } = await supabase
        .rpc('can_create_company');

      if (canCreateError) throw canCreateError;
      
      if (!canCreateData) {
        toast.error('You do not have permission to create a new company');
        return null;
      }

      // Create the company
      const { data, error } = await supabase
        .from('companies')
        .insert(companyData)
        .select()
        .single();

      if (error) throw error;

      // If this is the user's first company, set it as their company and make them an admin
      if (!userCompany) {
        const { error: userError } = await supabase
          .from('users')
          .update({
            company_id: data.company_id,
            is_company_admin: true
          })
          .eq('id', user!.id);

        if (userError) throw userError;

        setUserCompany(data);
        setIsAdmin(true);
        // Set the cache flag to true after creating a company
        setIsUserCompanyLoaded(true);
      }

      toast.success('Company created successfully');
      return data;
    } catch (err) {
      console.error('Error creating company:', err);
      setError('Failed to create company');
      toast.error('Failed to create company');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Update company details
  const updateCompany = async (companyId: string, companyData: Partial<Company>) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('companies')
        .update(companyData)
        .eq('company_id', companyId)
        .select()
        .single();

      if (error) throw error;

      // If this is the user's company, update local state
      if (userCompany && userCompany.company_id === companyId) {
        setUserCompany(data);
        // Mark as loaded after update to prevent unnecessary refetching
        setIsUserCompanyLoaded(true);
      }

      toast.success('Company updated successfully');
      return data;
    } catch (err) {
      console.error('Error updating company:', err);
      setError('Failed to update company');
      toast.error('Failed to update company');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Update company default weather
  const updateCompanyDefaultWeather = async (companyId: string, weather: 'Clear' | 'Cloudy' | 'Rain') => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .rpc('update_company_default_weather', {
          company_id_param: companyId,
          weather_param: weather
        });

      if (error) throw error;

      if (!data.success) {
        console.error('Failed to update default weather:', data.message);
        return false;
      }

      // Update local state
      if (userCompany && userCompany.company_id === companyId) {
        setUserCompany({
          ...userCompany,
          default_weather: weather
        });
        // Mark as loaded after update to prevent unnecessary refetching
        setIsUserCompanyLoaded(true);
      }

      return true;
    } catch (err) {
      console.error('Error updating company default weather:', err);
      setError('Failed to update company default weather');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Add a user to the company
  const addUserToCompany = async (email: string, companyId: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .rpc('add_user_to_company', {
          p_user_email: email,
          p_company_id: companyId
        });

      if (error) throw error;
      
      if (!data.success) {
        toast.error(data.message || 'Failed to add user to company');
        return false;
      }

      toast.success('User added to company successfully');
      return true;
    } catch (err) {
      console.error('Error adding user to company:', err);
      setError('Failed to add user to company');
      toast.error('Failed to add user to company');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Update a user's company admin status
  const updateUserAdminStatus = async (userId: string, isAdmin: boolean) => {
    setLoading(true);
    setError(null);

    try {
      if (!userCompany) {
        throw new Error('No company associated with user');
      }

      const { data, error } = await supabase
        .rpc('update_user_company_admin_status', {
          p_user_id: userId,
          p_is_admin: isAdmin,
          p_company_id: userCompany.company_id
        });

      if (error) throw error;
      
      if (!data.success) {
        toast.error(data.message || 'Failed to update user admin status');
        return false;
      }

      toast.success('User admin status updated');
      return true;
    } catch (err) {
      console.error('Error updating user admin status:', err);
      setError('Failed to update user admin status');
      toast.error('Failed to update user admin status');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    companies,
    userCompany,
    isAdmin,
    isSuperAdmin,
    canCreate,
    loading,
    error,
    fetchAllCompanies,
    createCompany,
    updateCompany,
    updateCompanyDefaultWeather,
    fetchCompanyUsers,
    addUserToCompany,
    updateUserAdminStatus
  };
}

export default useCompanies;