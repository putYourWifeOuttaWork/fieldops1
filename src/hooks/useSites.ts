import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Site, SubmissionDefaults, PetriDefaults, GasifierDefaults, VentPlacement, PrimaryFunction, ConstructionMaterial, InsulationType, HVACSystemType, IrrigationSystemType, LightingSystem, InteriorWorkingSurfaceType, MicrobialRiskZone, VentilationStrategy } from '../lib/types';
import { toast } from 'react-toastify';

// Interface for physical attributes and facility details
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
  // New dimension fields
  length?: number;
  width?: number;
  height?: number;
  // New gasifier density fields
  minEfficaciousGasifierDensity?: number;
  // New airflow dynamics fields
  hasDeadZones?: boolean;
  numRegularlyOpenedPorts?: number;
  // New environmental fields
  interiorWorkingSurfaceTypes?: InteriorWorkingSurfaceType[];
  microbialRiskZone?: MicrobialRiskZone;
  quantityDeadzones?: number;
  // Ventilation strategy
  ventilationStrategy?: VentilationStrategy;
}

export function useSites(programId?: string) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSites = useCallback(async (pid?: string) => {
    const id = pid || programId;
    if (!id) return;
    
    console.log(`[useSites] fetchSites started for programId: ${id}`);
    setLoading(true);
    setError(null);
    
    try {
      const startTime = performance.now();
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('program_id', id)
        .order('name', { ascending: true });
        
      const endTime = performance.now();
      console.log(`[useSites] fetchSites query took ${(endTime - startTime).toFixed(2)}ms`);
      
      if (error) {
        console.error('[useSites] Error fetching sites:', error);
        throw error;
      }
      
      console.log(`[useSites] fetchSites succeeded, found ${data?.length || 0} sites`);
      setSites(data || []);
    } catch (err) {
      console.error('[useSites] Error in fetchSites:', err);
      setError('Failed to load sites');
    } finally {
      setLoading(false);
      console.log('[useSites] fetchSites completed, loading state set to false');
    }
  }, [programId]);

  const fetchSite = useCallback(async (siteId: string) => {
    console.log(`[useSites] fetchSite started for siteId: ${siteId}`);
    setLoading(true);
    setError(null);
    
    try {
      const startTime = performance.now();
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('site_id', siteId)
        .single();
        
      const endTime = performance.now();
      console.log(`[useSites] fetchSite query took ${(endTime - startTime).toFixed(2)}ms`);
      
      if (error) {
        console.error('[useSites] Error fetching site:', error);
        throw error;
      }
      
      console.log(`[useSites] fetchSite succeeded, retrieved site: ${data?.name}`);
      return data;
    } catch (err) {
      console.error('[useSites] Error in fetchSite:', err);
      setError('Failed to load site');
      return null;
    } finally {
      setLoading(false);
      console.log('[useSites] fetchSite completed, loading state set to false');
    }
  }, []);

  // Update site name
  const updateSiteName = useCallback(async (siteId: string, newName: string): Promise<boolean> => {
    console.log(`[useSites] updateSiteName started for siteId: ${siteId}, newName: ${newName}`);
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase
        .from('sites')
        .update({ name: newName })
        .eq('site_id', siteId)
        .select()
        .single();
      
      if (error) {
        console.error('[useSites] Error updating site name:', error);
        throw error;
      }
      
      // Update the site in local state
      setSites(prevSites => 
        prevSites.map(site => 
          site.site_id === siteId ? {...site, name: newName} : site
        )
      );
      
      console.log(`[useSites] Site name updated successfully to: ${newName}`);
      return true;
    } catch (err) {
      console.error('[useSites] Error in updateSiteName:', err);
      setError(`Failed to update site name: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setLoading(false);
      console.log('[useSites] updateSiteName completed, loading state set to false');
    }
  }, []);

  // Update site weather defaults
  const updateSiteWeatherDefaults = useCallback(async (
    siteId: string,
    temperature: number,
    humidity: number,
    weather: 'Clear' | 'Cloudy' | 'Rain'
  ): Promise<boolean> => {
    console.log(`[useSites] updateSiteWeatherDefaults started for siteId: ${siteId}`);
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.rpc('update_site_weather_defaults', {
        p_site_id: siteId,
        p_temperature: temperature,
        p_humidity: humidity,
        p_weather: weather
      });
      
      if (error) {
        console.error('[useSites] Error updating site weather defaults:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to update site weather defaults');
      }
      
      console.log(`[useSites] Weather defaults updated successfully, result:`, data);
      
      // Update the site in local state to reflect changes
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
      
      return true;
    } catch (err) {
      console.error('[useSites] Error in updateSiteWeatherDefaults:', err);
      setError(`Failed to update site weather defaults: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setLoading(false);
      console.log('[useSites] updateSiteWeatherDefaults completed, loading state set to false');
    }
  }, []);

  // Update site dimensions and gasifier density
  const updateSiteDimensionsAndDensity = useCallback(async (
    siteId: string,
    length: number,
    width: number,
    height: number,
    minEfficaciousGasifierDensity: number = 2000,
    hasDeadZones: boolean = false,
    numRegularlyOpenedPorts?: number
  ): Promise<boolean> => {
    console.log(`[useSites] updateSiteDimensionsAndDensity started for siteId: ${siteId}`);
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.rpc('update_site_dimensions_and_density', {
        p_site_id: siteId,
        p_length: length,
        p_width: width,
        p_height: height,
        p_min_efficacious_gasifier_density_sqft_per_bag: minEfficaciousGasifierDensity,
        p_has_dead_zones: hasDeadZones,
        p_num_regularly_opened_ports: numRegularlyOpenedPorts
      });
      
      if (error) {
        console.error('[useSites] Error updating site dimensions and density:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to update site dimensions and density');
      }
      
      console.log(`[useSites] Dimensions and density updated successfully, result:`, data);
      
      // Refresh the sites to get updated calculated values
      await fetchSite(siteId);
      
      return true;
    } catch (err) {
      console.error('[useSites] Error in updateSiteDimensionsAndDensity:', err);
      setError(`Failed to update site dimensions and density: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setLoading(false);
      console.log('[useSites] updateSiteDimensionsAndDensity completed, loading state set to false');
    }
  }, [fetchSite]);

  // Update site properties
  const updateSiteProperties = useCallback(async (
    siteId: string,
    properties: SiteProperties
  ): Promise<boolean> => {
    console.log(`[useSites] updateSiteProperties started for siteId: ${siteId}`);
    setLoading(true);
    setError(null);
    
    try {
      // Check if dimensions are provided - if so, use the updateSiteDimensionsAndDensity function
      if (properties.length !== undefined && properties.width !== undefined && properties.height !== undefined) {
        await updateSiteDimensionsAndDensity(
          siteId,
          properties.length,
          properties.width,
          properties.height,
          properties.minEfficaciousGasifierDensity || 2000,
          properties.hasDeadZones || false,
          properties.numRegularlyOpenedPorts
        );
      }
      
      const { data, error } = await supabase.rpc('update_site_properties', {
        p_site_id: siteId,
        p_square_footage: properties.squareFootage,
        p_cubic_footage: properties.cubicFootage,
        p_num_vents: properties.numVents,
        p_vent_placements: properties.ventPlacements,
        p_primary_function: properties.primaryFunction,
        p_construction_material: properties.constructionMaterial,
        p_insulation_type: properties.insulationType,
        p_hvac_system_present: properties.hvacSystemPresent,
        p_hvac_system_type: properties.hvacSystemType,
        p_irrigation_system_type: properties.irrigationSystemType,
        p_lighting_system: properties.lightingSystem,
        p_interior_working_surface_types: properties.interiorWorkingSurfaceTypes,
        p_microbial_risk_zone: properties.microbialRiskZone || 'Medium',
        p_quantity_deadzones: properties.quantityDeadzones,
        p_ventilation_strategy: properties.ventilationStrategy
      });
      
      if (error) {
        console.error('[useSites] Error updating site properties:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to update site properties');
      }
      
      console.log(`[useSites] Site properties updated successfully, result:`, data);
      
      // Update the site in local state to reflect changes
      setSites(prevSites => 
        prevSites.map(site => 
          site.site_id === siteId 
            ? {
                ...site,
                square_footage: properties.squareFootage || site.square_footage,
                cubic_footage: properties.cubicFootage || site.cubic_footage,
                num_vents: properties.numVents || site.num_vents,
                vent_placements: properties.ventPlacements || site.vent_placements,
                primary_function: properties.primaryFunction || site.primary_function,
                construction_material: properties.constructionMaterial || site.construction_material,
                insulation_type: properties.insulationType || site.insulation_type,
                hvac_system_present: properties.hvacSystemPresent !== undefined ? properties.hvacSystemPresent : site.hvac_system_present,
                hvac_system_type: properties.hvacSystemType || site.hvac_system_type,
                irrigation_system_type: properties.irrigationSystemType || site.irrigation_system_type,
                lighting_system: properties.lightingSystem || site.lighting_system,
                // New dimension fields
                length: properties.length || site.length,
                width: properties.width || site.width,
                height: properties.height || site.height,
                // New density fields
                min_efficacious_gasifier_density_sqft_per_bag: properties.minEfficaciousGasifierDensity || site.min_efficacious_gasifier_density_sqft_per_bag,
                // New airflow dynamics fields
                has_dead_zones: properties.hasDeadZones !== undefined ? properties.hasDeadZones : site.has_dead_zones,
                num_regularly_opened_ports: properties.numRegularlyOpenedPorts || site.num_regularly_opened_ports,
                // New environmental fields
                interior_working_surface_types: properties.interiorWorkingSurfaceTypes || site.interior_working_surface_types,
                microbial_risk_zone: properties.microbialRiskZone || site.microbial_risk_zone,
                quantity_deadzones: properties.quantityDeadzones || site.quantity_deadzones,
                ventilation_strategy: properties.ventilationStrategy || site.ventilation_strategy
              } 
            : site
        )
      );
      
      return true;
    } catch (err) {
      console.error('[useSites] Error in updateSiteProperties:', err);
      setError(`Failed to update site properties: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setLoading(false);
      console.log('[useSites] updateSiteProperties completed, loading state set to false');
    }
  }, [updateSiteDimensionsAndDensity]);

  const createSite = async (
    name: string,
    type: 'Greenhouse' | 'Storage' | 'Transport' | 'Production Facility',
    pid?: string,
    submissionDefaults?: SubmissionDefaults,
    petriDefaults?: PetriDefaults[],
    gasifierDefaults?: GasifierDefaults[],
    siteProperties?: SiteProperties
  ) => {
    const id = pid || programId;
    if (!id) return null;
    
    console.log(`[useSites] createSite started for programId: ${id}, name: ${name}, type: ${type}`);
    setLoading(true);
    setError(null);
    
    try {
      // Log the template data being sent
      console.log('[useSites] Creating site with templates:', {
        submissionDefaults,
        petriDefaults: petriDefaults ? JSON.stringify(petriDefaults) : null,
        gasifierDefaults: gasifierDefaults ? JSON.stringify(gasifierDefaults) : null
      });
      
      // Use the updated RPC function with template defaults and site properties
      const { data, error } = await supabase.rpc('create_site_without_history', {
        p_name: name,
        p_type: type,
        p_program_id: id,
        p_submission_defaults: submissionDefaults ? submissionDefaults : null,
        p_petri_defaults: petriDefaults ? petriDefaults : null,
        p_gasifier_defaults: gasifierDefaults ? gasifierDefaults : null,
        // Physical attributes
        p_square_footage: siteProperties?.squareFootage,
        p_cubic_footage: siteProperties?.cubicFootage,
        p_num_vents: siteProperties?.numVents,
        p_vent_placements: siteProperties?.ventPlacements,
        // Facility details
        p_primary_function: siteProperties?.primaryFunction,
        p_construction_material: siteProperties?.constructionMaterial,
        p_insulation_type: siteProperties?.insulationType,
        // Environmental controls
        p_hvac_system_present: siteProperties?.hvacSystemPresent,
        p_hvac_system_type: siteProperties?.hvacSystemType,
        p_irrigation_system_type: siteProperties?.irrigationSystemType,
        p_lighting_system: siteProperties?.lightingSystem,
        // New dimension fields
        p_length: siteProperties?.length,
        p_width: siteProperties?.width,
        p_height: siteProperties?.height,
        // New density fields
        p_min_efficacious_gasifier_density_sqft_per_bag: siteProperties?.minEfficaciousGasifierDensity || 2000,
        // New airflow dynamics fields
        p_has_dead_zones: siteProperties?.hasDeadZones || false,
        p_num_regularly_opened_ports: siteProperties?.numRegularlyOpenedPorts,
        // New environmental fields
        p_interior_working_surface_types: siteProperties?.interiorWorkingSurfaceTypes,
        p_microbial_risk_zone: siteProperties?.microbialRiskZone || 'Medium',
        p_quantity_deadzones: siteProperties?.quantityDeadzones,
        p_ventilation_strategy: siteProperties?.ventilationStrategy
      });
      
      if (error) {
        console.error('[useSites] Error creating site:', error);
        // Throw the actual error message from Supabase for better debugging
        throw new Error(`Failed to create site: ${error.message}`);
      }
      
      if (!data || !data.site_id) {
        console.error('[useSites] No data returned from create_site_without_history');
        throw new Error('Failed to create site: No data returned');
      }
      
      console.log(`[useSites] Site created with ID: ${data.site_id}`);
      
      // Fetch the newly created site to get all fields
      const { data: siteData, error: fetchError } = await supabase
        .from('sites')
        .select('*')
        .eq('site_id', data.site_id)
        .single();
        
      if (fetchError) {
        console.error('Error fetching new site:', fetchError);
        throw new Error('Site created but failed to fetch details');
      }
      
      console.log(`[useSites] Retrieved new site details: ${JSON.stringify(siteData)}`);
      
      // Update local state
      setSites(prevSites => [...prevSites, siteData]);
      
      toast.success('Site created successfully!');
      return siteData;
    } catch (err) {
      console.error('[useSites] Error in createSite:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`Failed to create site: ${errorMessage}`);
      return null;
    } finally {
      setLoading(false);
      console.log('[useSites] createSite completed, loading state set to false');
    }
  };

  // Delete site
  const deleteSite = async (siteId: string): Promise<boolean> => {
    console.log(`[useSites] deleteSite started for siteId: ${siteId}`);
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase
        .from('sites')
        .delete()
        .eq('site_id', siteId);
        
      if (error) {
        console.error('[useSites] Error deleting site:', error);
        throw error;
      }
      
      // Update local state by removing the deleted site
      setSites(prevSites => prevSites.filter(site => site.site_id !== siteId));
      
      console.log(`[useSites] Site deleted successfully`);
      toast.success('Site deleted successfully!');
      return true;
    } catch (err) {
      console.error('[useSites] Error in deleteSite:', err);
      setError(`Failed to delete site: ${err instanceof Error ? err.message : 'Unknown error'}`);
      toast.error('Failed to delete site. Please try again.');
      return false;
    } finally {
      setLoading(false);
      console.log('[useSites] deleteSite completed, loading state set to false');
    }
  };

  // Update site template defaults
  const updateSiteTemplateDefaults = useCallback(async (
    siteId: string,
    submissionDefaults: SubmissionDefaults,
    petriDefaults: PetriDefaults[],
    gasifierDefaults: GasifierDefaults[] = [],
    siteProperties?: SiteProperties
  ) => {
    console.log(`[useSites] updateSiteTemplateDefaults started for siteId: ${siteId}`);
    setLoading(true);
    setError(null);
    
    try {
      // Use the RPC function to update template defaults
      const { data, error } = await supabase.rpc('update_site_template_defaults', {
        p_site_id: siteId,
        p_submission_defaults: submissionDefaults,
        p_petri_defaults: petriDefaults,
        p_gasifier_defaults: gasifierDefaults
      });
      
      if (error) {
        console.error('[useSites] Error updating site template defaults:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to update site template defaults');
      }
      
      console.log(`[useSites] Template defaults updated successfully, result:`, data);
      
      // If we have site properties to update, do that as well
      if (siteProperties) {
        const propertyUpdateResult = await updateSiteProperties(siteId, siteProperties);
        
        if (!propertyUpdateResult) {
          console.error('[useSites] Failed to update site properties');
          // Continue since template defaults were updated successfully
        }
      }
      
      // Update the site in local state to reflect changes
      setSites(prevSites => 
        prevSites.map(site => 
          site.site_id === siteId 
            ? {
                ...site, 
                submission_defaults: submissionDefaults, 
                petri_defaults: petriDefaults,
                gasifier_defaults: gasifierDefaults,
                // Also update site properties if they were provided
                ...(siteProperties && {
                  square_footage: siteProperties.squareFootage,
                  cubic_footage: siteProperties.cubicFootage,
                  num_vents: siteProperties.numVents,
                  vent_placements: siteProperties.ventPlacements,
                  primary_function: siteProperties.primaryFunction,
                  construction_material: siteProperties.constructionMaterial,
                  insulation_type: siteProperties.insulationType,
                  hvac_system_present: siteProperties.hvacSystemPresent,
                  hvac_system_type: siteProperties.hvacSystemType,
                  irrigation_system_type: siteProperties.irrigationSystemType,
                  lighting_system: siteProperties.lightingSystem,
                  // New dimension fields
                  length: siteProperties.length,
                  width: siteProperties.width,
                  height: siteProperties.height,
                  // New density fields
                  min_efficacious_gasifier_density_sqft_per_bag: siteProperties.minEfficaciousGasifierDensity,
                  // New airflow dynamics fields
                  has_dead_zones: siteProperties.hasDeadZones,
                  num_regularly_opened_ports: siteProperties.numRegularlyOpenedPorts,
                  // New environmental fields
                  interior_working_surface_types: siteProperties.interiorWorkingSurfaceTypes,
                  microbial_risk_zone: siteProperties.microbialRiskZone,
                  quantity_deadzones: siteProperties.quantityDeadzones,
                  ventilation_strategy: siteProperties.ventilationStrategy
                })
              } 
            : site
        )
      );
      
      return data;
    } catch (err) {
      console.error('[useSites] Error in updateSiteTemplateDefaults:', err);
      setError(`Failed to update site template defaults: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err; // Rethrow so the caller can handle it
    } finally {
      setLoading(false);
      console.log('[useSites] updateSiteTemplateDefaults completed, loading state set to false');
    }
  }, [updateSiteProperties]);

  // Clear site template defaults
  const clearSiteTemplateDefaults = useCallback(async (siteId: string): Promise<boolean> => {
    console.log(`[useSites] clearSiteTemplateDefaults started for siteId: ${siteId}`);
    setLoading(true);
    setError(null);
    
    try {
      // Use the RPC function to clear template defaults
      const { data, error } = await supabase.rpc('clear_site_template_defaults', {
        p_site_id: siteId
      });
      
      if (error) {
        console.error('[useSites] Error clearing site template defaults:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to clear site template defaults');
      }
      
      console.log('[useSites] Template defaults cleared successfully');
      
      // Update the site in local state to reflect changes
      setSites(prevSites => 
        prevSites.map(site => 
          site.site_id === siteId 
            ? {...site, submission_defaults: null, petri_defaults: null, gasifier_defaults: null} 
            : site
        )
      );
      
      return true;
    } catch (err) {
      console.error('[useSites] Error in clearSiteTemplateDefaults:', err);
      setError('Failed to clear template defaults');
      return false;
    } finally {
      setLoading(false);
      console.log('[useSites] clearSiteTemplateDefaults completed, loading state set to false');
    }
  }, []);

  // Load sites when component mounts or programId changes
  useEffect(() => {
    if (programId) {
      console.log(`[useSites] useEffect triggered with programId: ${programId}`);
      fetchSites();
    } else {
      console.log('[useSites] useEffect triggered but programId is undefined/null');
    }
  }, [programId, fetchSites]);

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
    // Functions for site template defaults
    updateSiteTemplateDefaults,
    clearSiteTemplateDefaults
  };
}