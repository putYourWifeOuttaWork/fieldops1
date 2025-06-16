import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Site, SubmissionDefaults, PetriDefaults, GasifierDefaults, VentPlacement, PrimaryFunction, ConstructionMaterial, InsulationType, HVACSystemType, IrrigationSystemType, LightingSystem, InteriorWorkingSurfaceType, MicrobialRiskZone, VentilationStrategy } from '../lib/types';
import { toast } from 'react-toastify';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { withRetry, fetchSitesByProgramId, fetchSiteById } from '../lib/api';

interface SiteProperties {
  squareFootage?: number;
  cubicFootage?: number;
  numVents?: number;
  ventPlacements?: VentPlacement[];
  primaryFunction?: PrimaryFunction;
  constructionMaterial?: ConstructionMaterial;
  insulationType?: InsulationType;
  hvacSystemPresent?: boolean;
  hvacSystemType?: HVACSystemType;
  irrigationSystemType?: IrrigationSystemType;
  lightingSystem?: LightingSystem;
  length?: number;
  width?: number;
  height?: number;
  minEfficaciousGasifierDensity?: number;
  hasDeadZones?: boolean;
  numRegularlyOpenedPorts?: number;
  interiorWorkingSurfaceTypes?: InteriorWorkingSurfaceType[];
  microbialRiskZone?: MicrobialRiskZone;
  quantityDeadzones?: number;
  ventilationStrategy?: VentilationStrategy;
}

export function useSites(programId?: string) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  
  const sitesQuery = useQuery({
    queryKey: ['sites', programId],
    queryFn: async () => {
      if (!programId) return [];
      
      const { data, error } = await fetchSitesByProgramId(programId);
      
      if (error) {
        throw error;
      }
      
      return data || [];
    },
    enabled: !!programId,
    keepPreviousData: true,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    if (sitesQuery.data) {
      setSites(sitesQuery.data);
    }
    
    setLoading(sitesQuery.isLoading);
    setError(sitesQuery.error ? String(sitesQuery.error) : null);
  }, [sitesQuery.data, sitesQuery.isLoading, sitesQuery.error]);

  const fetchSites = useCallback(async (pid?: string) => {
    const id = pid || programId;
    if (!id) return;
    
    console.log(`[useSites] fetchSites started for programId: ${id}`);
    setLoading(true);
    setError(null);
    
    try {
      const startTime = performance.now();
      const { data, error } = await fetchSitesByProgramId(id);
        
      const endTime = performance.now();
      console.log(`[useSites] fetchSites query took ${(endTime - startTime).toFixed(2)}ms`);
      
      if (error) {
        console.error('[useSites] Error fetching sites:', error);
        throw error;
      }
      
      console.log(`[useSites] fetchSites succeeded, found ${data?.length || 0} sites`);
      setSites(data || []);
      
      queryClient.setQueryData(['sites', id], data);
    } catch (err) {
      console.error('[useSites] Error in fetchSites:', err);
      setError('Failed to load sites');
    } finally {
      setLoading(false);
      console.log('[useSites] fetchSites completed, loading state set to false');
    }
  }, [programId, queryClient]);

  const fetchSite = useCallback(async (siteId: string) => {
    console.log(`[useSites] fetchSite started for siteId: ${siteId}`);
    setLoading(true);
    setError(null);
    
    try {
      const cachedSites = queryClient.getQueryData<Site[]>(['sites', programId]);
      const cachedSite = cachedSites?.find(site => site.site_id === siteId);
      
      if (cachedSite) {
        console.log(`[useSites] fetchSite found site in cache: ${cachedSite.name}`);
        setLoading(false);
        return cachedSite;
      }
      
      const startTime = performance.now();
      const { data, error } = await fetchSiteById(siteId);
      
      const endTime = performance.now();
      console.log(`[useSites] fetchSite query took ${(endTime - startTime).toFixed(2)}ms`);
      
      if (error) {
        console.error('[useSites] Error fetching site:', error);
        throw error;
      }
      
      console.log(`[useSites] fetchSite succeeded, retrieved site: ${data?.name}`);
      
      queryClient.setQueryData(['site', siteId], data);
      
      return data;
    } catch (err) {
      console.error('[useSites] Error in fetchSite:', err);
      setError('Failed to load site');
      return null;
    } finally {
      setLoading(false);
      console.log('[useSites] fetchSite completed, loading state set to false');
    }
  }, [programId, queryClient]);

  const updateSiteNameMutation = useMutation({
    mutationFn: async ({ siteId, newName }: { siteId: string; newName: string }) => {
      console.log(`[useSites] updateSiteName started for siteId: ${siteId}, newName: ${newName}`);
      
      const { data, error } = await withRetry(() => 
        supabase
          .from('sites')
          .update({ name: newName })
          .eq('site_id', siteId)
          .select()
          .single()
      );
      
      if (error) {
        console.error('[useSites] Error updating site name:', error);
        throw error;
      }
      
      console.log(`[useSites] Site name updated successfully to: ${newName}`);
      return data;
    },
    onSuccess: (updatedSite) => {
      setSites(prevSites => 
        prevSites.map(site => 
          site.site_id === updatedSite.site_id ? {...site, name: updatedSite.name} : site
        )
      );
      
      queryClient.setQueryData(['site', updatedSite.site_id], updatedSite);
      
      queryClient.setQueryData<Site[]>(['sites', programId], (oldData) => 
        oldData ? oldData.map(site => 
          site.site_id === updatedSite.site_id ? updatedSite : site
        ) : []
      );
      
      toast.success('Site name updated successfully');
    },
    onError: (error) => {
      console.error('[useSites] Error in updateSiteName:', error);
      toast.error(`Failed to update site name: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  const updateSiteName = useCallback(async (siteId: string, newName: string): Promise<boolean> => {
    try {
      await updateSiteNameMutation.mutateAsync({ siteId, newName });
      return true;
    } catch (error) {
      return false;
    }
  }, [updateSiteNameMutation]);

  const updateSiteWeatherDefaultsMutation = useMutation({
    mutationFn: async ({ 
      siteId, temperature, humidity, weather 
    }: { 
      siteId: string;
      temperature: number;
      humidity: number;
      weather: 'Clear' | 'Cloudy' | 'Rain';
    }) => {
      console.log(`[useSites] updateSiteWeatherDefaults started for siteId: ${siteId}`);
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('update_site_weather_defaults', {
          p_site_id: siteId,
          p_temperature: temperature,
          p_humidity: humidity,
          p_weather: weather
        })
      );
      
      if (error) {
        console.error('[useSites] Error updating site weather defaults:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to update site weather defaults');
      }
      
      return { siteId, temperature, humidity, weather };
    },
    onSuccess: ({ siteId, temperature, humidity, weather }) => {
      setSites(prevSites => 
        prevSites.map(site => 
          site.site_id === siteId 
            ? {
                ...site, 
                default_temperature: temperature, 
                default_humidity: humidity,
                default_weather: weather
              } 
            : site
        )
      );
      
      queryClient.setQueryData(['site', siteId], (oldData: Site | undefined) => 
        oldData ? {
          ...oldData,
          default_temperature: temperature,
          default_humidity: humidity,
          default_weather: weather
        } : undefined
      );
      
      queryClient.setQueryData<Site[]>(['sites', programId], (oldData) => 
        oldData ? oldData.map(site => 
          site.site_id === siteId 
            ? {
                ...site,
                default_temperature: temperature,
                default_humidity: humidity,
                default_weather: weather
              } 
            : site
        ) : []
      );
      
      toast.success('Site weather defaults updated successfully');
    },
    onError: (error) => {
      console.error('[useSites] Error in updateSiteWeatherDefaults:', error);
      toast.error(`Failed to update site weather defaults: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  const updateSiteWeatherDefaults = useCallback(async (
    siteId: string,
    temperature: number,
    humidity: number,
    weather: 'Clear' | 'Cloudy' | 'Rain'
  ): Promise<boolean> => {
    try {
      await updateSiteWeatherDefaultsMutation.mutateAsync({
        siteId, temperature, humidity, weather
      });
      return true;
    } catch (error) {
      return false;
    }
  }, [updateSiteWeatherDefaultsMutation]);

  const createSiteMutation = useMutation({
    mutationFn: async ({
      name,
      type,
      pid,
      submissionDefaults,
      petriDefaults,
      gasifierDefaults,
      siteProperties
    }: {
      name: string;
      type: 'Greenhouse' | 'Storage' | 'Transport' | 'Production Facility';
      pid?: string;
      submissionDefaults?: SubmissionDefaults;
      petriDefaults?: PetriDefaults[];
      gasifierDefaults?: GasifierDefaults[];
      siteProperties?: SiteProperties;
    }) => {
      const id = pid || programId;
      if (!id) throw new Error('Program ID is required');
      
      console.log(`[useSites] createSite started for programId: ${id}, name: ${name}, type: ${type}`);
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('create_site_without_history', {
          p_name: name,
          p_type: type,
          p_program_id: id,
          p_submission_defaults: submissionDefaults || null,
          p_petri_defaults: petriDefaults || null,
          p_gasifier_defaults: gasifierDefaults || null,
          p_square_footage: siteProperties?.squareFootage,
          p_cubic_footage: siteProperties?.cubicFootage,
          p_num_vents: siteProperties?.numVents,
          p_vent_placements: siteProperties?.ventPlacements,
          p_primary_function: siteProperties?.primaryFunction,
          p_construction_material: siteProperties?.constructionMaterial,
          p_insulation_type: siteProperties?.insulationType,
          p_hvac_system_present: siteProperties?.hvacSystemPresent,
          p_hvac_system_type: siteProperties?.hvacSystemType,
          p_irrigation_system_type: siteProperties?.irrigationSystemType,
          p_lighting_system: siteProperties?.lightingSystem,
          p_length: siteProperties?.length,
          p_width: siteProperties?.width,
          p_height: siteProperties?.height,
          p_min_efficacious_gasifier_density_sqft_per_bag: siteProperties?.minEfficaciousGasifierDensity || 2000,
          p_has_dead_zones: siteProperties?.hasDeadZones || false,
          p_num_regularly_opened_ports: siteProperties?.numRegularlyOpenedPorts,
          p_interior_working_surface_types: siteProperties?.interiorWorkingSurfaceTypes,
          p_microbial_risk_zone: siteProperties?.microbialRiskZone || 'Medium',
          p_quantity_deadzones: siteProperties?.quantityDeadzones,
          p_ventilation_strategy: siteProperties?.ventilationStrategy
        })
      );
      
      if (error) {
        console.error('[useSites] Error creating site:', error);
        throw new Error(`Failed to create site: ${error.message}`);
      }
      
      if (!data || !data.site_id) {
        throw new Error('Failed to create site: No data returned');
      }
      
      const { data: siteData, error: fetchError } = await withRetry(() => 
        supabase
          .from('sites')
          .select('*')
          .eq('site_id', data.site_id)
          .single()
      );
      
      if (fetchError) {
        throw new Error('Site created but failed to fetch details');
      }
      
      return siteData;
    },
    onSuccess: (newSite) => {
      setSites(prevSites => [...prevSites, newSite]);
      
      queryClient.setQueryData(['site', newSite.site_id], newSite);
      
      queryClient.setQueryData<Site[]>(['sites', programId], (oldData) => 
        oldData ? [...oldData, newSite] : [newSite]
      );
      
      toast.success('Site created successfully!');
    },
    onError: (error) => {
      console.error('[useSites] Error in createSite:', error);
      toast.error(`Failed to create site: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  const createSite = useCallback(async (
    name: string,
    type: 'Greenhouse' | 'Storage' | 'Transport' | 'Production Facility',
    pid?: string,
    submissionDefaults?: SubmissionDefaults,
    petriDefaults?: PetriDefaults[],
    gasifierDefaults?: GasifierDefaults[],
    siteProperties?: SiteProperties
  ) => {
    try {
      const newSite = await createSiteMutation.mutateAsync({
        name,
        type,
        pid,
        submissionDefaults,
        petriDefaults,
        gasifierDefaults,
        siteProperties
      });
      return newSite;
    } catch (error) {
      return null;
    }
  }, [createSiteMutation, programId]);

  const deleteSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      console.log(`[useSites] deleteSite started for siteId: ${siteId}`);
      
      const { error } = await withRetry(() => 
        supabase
          .from('sites')
          .delete()
          .eq('site_id', siteId)
      );
      
      if (error) {
        console.error('[useSites] Error deleting site:', error);
        throw error;
      }
      
      return siteId;
    },
    onSuccess: (deletedSiteId) => {
      setSites(prevSites => prevSites.filter(site => site.site_id !== deletedSiteId));
      
      queryClient.removeQueries(['site', deletedSiteId]);
      
      queryClient.setQueryData<Site[]>(['sites', programId], (oldData) => 
        oldData ? oldData.filter(site => site.site_id !== deletedSiteId) : []
      );
      
      toast.success('Site deleted successfully!');
    },
    onError: (error) => {
      console.error('[useSites] Error in deleteSite:', error);
      toast.error('Failed to delete site. Please try again.');
    }
  });

  const deleteSite = useCallback(async (siteId: string): Promise<boolean> => {
    try {
      await deleteSiteMutation.mutateAsync(siteId);
      return true;
    } catch (error) {
      return false;
    }
  }, [deleteSiteMutation]);

  return {
    sites,
    loading,
    error,
    fetchSites,
    fetchSite,
    createSite,
    deleteSite,
    setSites,
    updateSiteName,
    updateSiteWeatherDefaults,
    updateSiteProperties,
    updateSiteDimensionsAndDensity,
    updateSiteTemplateDefaults,
    clearSiteTemplateDefaults
  };
}