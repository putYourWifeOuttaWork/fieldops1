import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Plus, CloudRain, Sun, Cloud, Clock, Building, ArrowRight, MapPin, Home, Hash } from 'lucide-react';
import Button from '../components/common/Button';
import Card, { CardHeader, CardContent, CardFooter } from '../components/common/Card';
import usePilotPrograms from '../hooks/usePilotPrograms';
import { useSites } from '../hooks/useSites';
import useCompanies from '../hooks/useCompanies';
import LoadingScreen from '../components/common/LoadingScreen';
import { format } from 'date-fns';
import { supabase } from '../lib/supabaseClient';
import NewSubmissionModal from '../components/submissions/NewSubmissionModal';
import { PilotProgram, Site } from '../lib/types';
import { toast } from 'react-toastify';
import useWeather from '../hooks/useWeather';
import AnalyticsChart from '../components/dashboard/AnalyticsChart';

// Type for recent submission from the get_recent_submissions RPC
interface RecentSubmission {
  submission_id: string;
  site_id: string;
  site_name: string;
  program_id: string;
  program_name: string;
  temperature: number;
  humidity: number;
  created_at: string;
  petri_count: number;
  gasifier_count?: number;
  global_submission_id?: number;
}

const HomePage = () => {
  const navigate = useNavigate();
  const { programs, isLoading: programsLoading } = usePilotPrograms();
  const { userCompany, isAdmin: isCompanyAdmin, updateCompanyDefaultWeather, loading: companyLoading } = useCompanies();
  
  // Weather hook moved here for clarity
  const { 
    locationData, 
    currentConditions, 
    hourlyForecast,
    isLoading: weatherLoading, 
    error: weatherError,
    locationPermission,
    suggestedWeatherType
  } = useWeather();
  
  // Refs to track if initial selection has been done
  const isInitialProgramSelectionDone = useRef(false);
  const isInitialSiteSelectionDone = useRef(false);
  const initialWeatherUpdateAttemptedRef = useRef(false);
  
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<PilotProgram | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [weatherType, setWeatherType] = useState<'Clear' | 'Cloudy' | 'Rain'>(
    userCompany?.default_weather || 'Clear'
  );
  const [hasUserManuallySetWeather, setHasUserManuallySetWeather] = useState(false);
  const [isNewSubmissionModalOpen, setIsNewSubmissionModalOpen] = useState(false);
  
  // Pre-select the first program when the page loads, but only once
  useEffect(() => {
    if (!programsLoading && programs.length > 0 && !selectedProgramId && !isInitialProgramSelectionDone.current) {
      // Select the first program
      setSelectedProgramId(programs[0].program_id);
      setSelectedProgram(programs[0]);
      isInitialProgramSelectionDone.current = true;
    }
  }, [programs, programsLoading, selectedProgramId]);
  
  // Handle program selection
  const handleProgramSelect = useCallback((programId: string) => {
    if (selectedProgramId === programId) {
      setSelectedProgramId(null);
      setSelectedProgram(null);
      setSelectedSiteId(null);
      setSelectedSite(null);
    } else {
      setSelectedProgramId(programId);
    }
  }, [selectedProgramId]);
  
  // Handle site selection
  const handleSiteSelect = useCallback((siteId: string) => {
    if (selectedSiteId === siteId) {
      setSelectedSiteId(null);
      setSelectedSite(null);
    } else {
      setSelectedSiteId(siteId);
    }
  }, [selectedSiteId]);
  
  // Update selected program when program ID changes
  useEffect(() => {
    if (selectedProgramId && programs.length > 0) {
      const program = programs.find(p => p.program_id === selectedProgramId);
      setSelectedProgram(program || null);
      
      // Reset site selection when program changes
      setSelectedSiteId(null);
      setSelectedSite(null);
      isInitialSiteSelectionDone.current = false;
    } else {
      setSelectedProgram(null);
    }
  }, [selectedProgramId, programs]);
  
  // Fetch sites when program is selected - memoized with useCallback
  const loadSites = useCallback(async () => {
    if (!selectedProgramId) {
      setSites([]);
      return;
    }
    
    setSitesLoading(true);
    try {
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('program_id', selectedProgramId)
        .order('name');
        
      if (error) throw error;
      setSites(data || []);
      
      // Pre-select the first site if available, but only once
      if (data && data.length > 0 && !selectedSiteId && !isInitialSiteSelectionDone.current) {
        setSelectedSiteId(data[0].site_id);
        setSelectedSite(data[0]);
        isInitialSiteSelectionDone.current = true;
      }
    } catch (error) {
      console.error('Error loading sites:', error);
      toast.error('Failed to load sites');
    } finally {
      setSitesLoading(false);
    }
  }, [selectedProgramId, selectedSiteId]);
  
  // Call loadSites when selectedProgramId changes
  useEffect(() => {
    loadSites();
  }, [loadSites]);
  
  // Update selected site when site ID changes
  useEffect(() => {
    if (selectedSiteId && sites.length > 0) {
      const site = sites.find(s => s.site_id === selectedSiteId);
      setSelectedSite(site || null);
    } else {
      setSelectedSite(null);
    }
  }, [selectedSiteId, sites]);
  
  // Fetch recent submissions - memoized with useCallback
  const fetchRecentSubmissions = useCallback(async () => {
    setSubmissionsLoading(true);
    try {
      // Use the RPC function to get recent submissions
      const { data, error } = await supabase
        .rpc('get_recent_submissions_v3', { 
          limit_param: 10,
          program_id_param: selectedProgramId,
          site_id_param: selectedSiteId
        });
      
      if (error) throw error;
      setRecentSubmissions(data || []);
    } catch (error) {
      console.error('Error fetching recent submissions:', error);
      toast.error('Error fetching recent submissions');
    } finally {
      setSubmissionsLoading(false);
    }
  }, [selectedProgramId, selectedSiteId]);
  
  // Fetch recent submissions when program or site selection changes
  useEffect(() => {
    // Only fetch when site is selected
    if (selectedSiteId) {
      fetchRecentSubmissions();
    } else {
      setRecentSubmissions([]);
    }
  }, [selectedSiteId, fetchRecentSubmissions]);
  
  // Set weather type based on Visual Crossing API data when it loads
  useEffect(() => {
    if (suggestedWeatherType && !hasUserManuallySetWeather) {
      setWeatherType(suggestedWeatherType);
      
      // If company admin, update the default weather
      if (isCompanyAdmin && userCompany && !initialWeatherUpdateAttemptedRef.current) {
        if (suggestedWeatherType !== userCompany.default_weather) {
          const updateResult = updateCompanyDefaultWeather(userCompany.company_id, suggestedWeatherType);
          updateResult.then(success => {
            if (success) {
              toast.success('Company default weather updated automatically based on your location');
            }
          });
        }
        initialWeatherUpdateAttemptedRef.current = true;
      }
    }
  }, [suggestedWeatherType, isCompanyAdmin, userCompany, updateCompanyDefaultWeather, hasUserManuallySetWeather]);
  
  // Handle weather selection and update for company
  const handleWeatherChange = async (weather: 'Clear' | 'Cloudy' | 'Rain') => {
    // Mark that user has manually set the weather
    setHasUserManuallySetWeather(true);
    
    // Update the local state for the selected weather
    setWeatherType(weather);
    
    // Only update the company default if user is a company admin
    if (isCompanyAdmin && userCompany) {
      const success = await updateCompanyDefaultWeather(userCompany.company_id, weather);
      if (success) {
        toast.success('Company default weather updated successfully');
      }
    }
  };
  
  // Handle quick log button - open the modal for new submissions
  const handleQuickLog = useCallback(() => {
    if (!selectedSite || !selectedProgram) {
      toast.warning('Please select a site first');
      return;
    }
    
    // Open the modal directly
    setIsNewSubmissionModalOpen(true);
  }, [selectedSite, selectedProgram]);
  
  // Handle submission created
  const handleSubmissionCreated = useCallback(() => {
    fetchRecentSubmissions();
    setIsNewSubmissionModalOpen(false);
  }, [fetchRecentSubmissions]);
  
  if (programsLoading || companyLoading) {
    return <LoadingScreen />;
  }
  
  return (
    <div className="animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to GRMTek Sporeless</h1>
          <p className="text-gray-600 mt-1">Your field operations dashboard</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Program/Site Selection Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <h2 className="text-lg font-semibold">Select Program & Site</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Program Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" id="program-selector-label">
                  Select Program
                </label>
                <div 
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2" 
                  role="radiogroup" 
                  aria-labelledby="program-selector-label"
                >
                  {programs.length === 0 ? (
                    <p className="col-span-full text-gray-500 text-center">
                      No programs available. <a href="/programs\" className="text-primary-600 hover:text-primary-800">Create one</a>
                    </p>
                  ) : (
                    programs.map(program => (
                      <button
                        key={program.program_id}
                        onClick={() => handleProgramSelect(program.program_id)}
                        className={`p-3 rounded-md text-left transition-colors ${
                          selectedProgramId === program.program_id
                            ? 'bg-primary-100 border-primary-200 border text-primary-800'
                            : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                        }`}
                        role="radio"
                        aria-checked={selectedProgramId === program.program_id}
                        id={`program-${program.program_id}`}
                      >
                        <p className="font-medium truncate">{program.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {program.total_sites} Sites
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
              
              {/* Site Selector - Only show if a program is selected */}
              {selectedProgramId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" id="site-selector-label">
                    Select Site
                  </label>
                  {sitesLoading ? (
                    <div className="flex justify-center p-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                    </div>
                  ) : sites.length === 0 ? (
                    <p className="text-gray-500 text-center p-4 bg-gray-50 rounded-md">
                      No sites in this program. <button onClick={() => navigate(`/programs/${selectedProgramId}/sites`)} className="text-primary-600 hover:text-primary-800">Add one</button>
                    </p>
                  ) : (
                    <div 
                      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2"
                      role="radiogroup" 
                      aria-labelledby="site-selector-label"
                    >
                      {sites.map(site => (
                        <button
                          key={site.site_id}
                          onClick={() => handleSiteSelect(site.site_id)}
                          className={`p-3 rounded-md text-left transition-colors ${
                            selectedSiteId === site.site_id
                              ? 'bg-secondary-100 border-secondary-200 border text-secondary-800'
                              : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                          }`}
                          role="radio"
                          aria-checked={selectedSiteId === site.site_id}
                          id={`site-${site.site_id}`}
                        >
                          <div className="flex justify-between items-start">
                            <p className="font-medium truncate">{site.name}</p>
                            <span className="text-xs bg-gray-100 text-gray-800 px-1 rounded">
                              {site.type}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {site.total_petris} petri samples
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-end space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/programs')}
              testId="view-programs-button"
            >
              View Programs
            </Button>
            {selectedProgramId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/programs/${selectedProgramId}/sites`)}
                testId="view-all-sites-button"
              >
                View All Sites
              </Button>
            )}
          </CardFooter>
        </Card>
        
        {/* Today's Weather Card */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Today's Weather</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              Select the weather for your current submission. 
              {isCompanyAdmin && userCompany ? " As a company admin, your selection will also update the company-wide default." : ""}
            </p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="weather-selector-label">
              <button
                onClick={() => handleWeatherChange('Clear')}
                className={`flex flex-col items-center p-3 rounded-md transition-colors ${
                  weatherType === 'Clear'
                    ? 'bg-yellow-100 border-yellow-200 border text-yellow-800'
                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                }`}
                role="radio"
                aria-checked={weatherType === 'Clear'}
                id="weather-clear"
              >
                <Sun className={`h-8 w-8 ${weatherType === 'Clear' ? 'text-yellow-600' : 'text-gray-400'}`} />
                <span className="mt-2 text-sm font-medium">Clear</span>
              </button>
              
              <button
                onClick={() => handleWeatherChange('Cloudy')}
                className={`flex flex-col items-center p-3 rounded-md transition-colors ${
                  weatherType === 'Cloudy'
                    ? 'bg-gray-800 border-gray-900 border text-white'
                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                }`}
                role="radio"
                aria-checked={weatherType === 'Cloudy'}
                id="weather-cloudy"
              >
                <Cloud className={`h-8 w-8 ${weatherType === 'Cloudy' ? 'text-white' : 'text-gray-400'}`} />
                <span className="mt-2 text-sm font-medium">Cloudy</span>
              </button>
              
              <button
                onClick={() => handleWeatherChange('Rain')}
                className={`flex flex-col items-center p-3 rounded-md transition-colors ${
                  weatherType === 'Rain'
                    ? 'bg-blue-100 border-blue-200 border text-blue-800'
                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                }`}
                role="radio"
                aria-checked={weatherType === 'Rain'}
                id="weather-rain"
              >
                <CloudRain className={`h-8 w-8 ${weatherType === 'Rain' ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="mt-2 text-sm font-medium">Rain</span>
              </button>
            </div>
            
            {/* Current Weather Data Display */}
            {locationPermission === 'denied' ? (
              <div className="mt-4 border-t pt-4 text-center">
                <p className="text-sm text-gray-600">
                  Location access denied. Enable location services to see current weather.
                </p>
              </div>
            ) : weatherLoading ? (
              <div className="mt-4 flex justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
              </div>
            ) : weatherError ? (
              <p className="text-xs text-gray-500 mt-4">
                Unable to load local weather data: {weatherError}
              </p>
            ) : currentConditions && locationData ? (
              <div className="mt-4 border-t pt-4">
                <p className="text-sm font-medium">Current conditions in your location:</p>
                <div className="flex items-center mt-2">
                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
                    {suggestedWeatherType === 'Clear' ? (
                      <Sun className="h-8 w-8 text-yellow-500" />
                    ) : suggestedWeatherType === 'Cloudy' ? (
                      <Cloud className="h-8 w-8 text-gray-500" />
                    ) : suggestedWeatherType === 'Rain' ? (
                      <CloudRain className="h-8 w-8 text-blue-500" />
                    ) : (
                      <Sun className="h-8 w-8 text-yellow-500" />
                    )}
                  </div>
                  <div className="ml-2">
                    <p className="font-medium">
                      {currentConditions.conditions || suggestedWeatherType || "Unknown"}
                    </p>
                    <p className="text-sm">{currentConditions.temp}°F, {currentConditions.RelativeHumidity || currentConditions.humidity}% humidity</p>
                  </div>
                </div>
                
                {hourlyForecast && hourlyForecast.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600">
                    <p>Next hour: {hourlyForecast[0].conditions}, {hourlyForecast[0].temp}°F</p>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
      
      {/* Recent Submissions Card - Only shown if there are submissions or a site is selected */}
      {(recentSubmissions.length > 0 || selectedSite) && (
        <Card className="mb-6">
          <CardHeader className="flex justify-between items-center">
            <div className="flex items-center">
              <Clock className="mr-2 h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-semibold">Recent Submissions</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRecentSubmissions}
            >
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {submissionsLoading ? (
              <div className="flex justify-center p-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : recentSubmissions.length === 0 ? (
              <div className="text-center py-8">
                <Leaf className="mx-auto h-12 w-12 text-gray-300" />
                <p className="text-gray-600 mt-2">No recent submissions found</p>
                {selectedSite && (
                  <Button
                    variant="primary"
                    className="mt-4"
                    icon={<Plus size={16} />}
                    onClick={handleQuickLog}
                    disabled={weatherLoading}
                  >
                    Create New Submission
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Submission ID
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Program
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Site
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Temperature
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Humidity
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Samples
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentSubmissions.map((submission) => (
                      <tr key={submission.submission_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {submission.global_submission_id ? (
                            <span className="inline-flex items-center">
                              <Hash size={14} className="mr-1 text-primary-500" />
                              {submission.global_submission_id}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(new Date(submission.created_at), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {submission.program_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {submission.site_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {submission.temperature}°F
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {submission.humidity}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex space-x-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800">
                              {submission.petri_count} Petri
                            </span>
                            {submission.gasifier_count !== undefined && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent-100 text-accent-800">
                                {submission.gasifier_count} Gasifier
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button 
                            onClick={() => navigate(`/programs/${submission.program_id}/sites/${submission.site_id}`)}
                            className="text-primary-600 hover:text-primary-900 flex items-center justify-end"
                            aria-label={`View submission details for ${submission.site_name} on ${format(new Date(submission.created_at), 'MMM d, yyyy')}`}
                          >
                            View 
                            <ArrowRight className="ml-1 h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Analytics Chart - Only shown if a program or site is selected */}
      {(selectedProgramId || selectedSiteId) && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Analytics</h2>
          </CardHeader>
          <CardContent>
            <AnalyticsChart 
              programId={selectedProgramId}
              siteId={selectedSiteId}
            />
          </CardContent>
        </Card>
      )}

      {/* New Submission Modal */}
      {selectedSite && (
        <NewSubmissionModal
          isOpen={isNewSubmissionModalOpen}
          onClose={() => setIsNewSubmissionModalOpen(false)}
          siteId={selectedSite.site_id}
          siteName={selectedSite.name}
          programId={selectedProgram?.program_id || ''}
          onSubmissionCreated={handleSubmissionCreated}
          selectedSite={selectedSite}
          companyDefaultWeather={userCompany?.default_weather}
          initialWeather={weatherType}
          initialTemperature={currentConditions?.temp}
          initialHumidity={currentConditions?.RelativeHumidity}
          weatherData={currentConditions}
          isWeatherLoading={weatherLoading}
        />
      )}
    </div>
  );
};

export default HomePage;