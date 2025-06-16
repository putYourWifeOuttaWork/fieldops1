import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { Plus, Search, Building, Leaf, ArrowLeft, History, Info } from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import LoadingScreen from '../components/common/LoadingScreen';
import NewSiteModal from '../components/sites/NewSiteModal';
import { useSites } from '../hooks/useSites';
import { usePilotPrograms } from '../hooks/usePilotPrograms';
import useUserRole from '../hooks/useUserRole';
import PermissionModal from '../components/common/PermissionModal';
import SiteCard from '../components/sites/SiteCard';
import { Site } from '../lib/types';
import { toast } from 'react-toastify';
import ProgramDetailsModal from '../components/pilotPrograms/ProgramDetailsModal';

const SitesPage = () => {
  const navigate = useNavigate();
  const { programId } = useParams<{ programId: string }>();
  const { 
    selectedProgram, 
    setSelectedProgram, 
    setSelectedSite,
  } = usePilotProgramStore();
  const { sites, loading: sitesLoading, fetchSites, deleteSite } = useSites(programId);
  const { fetchPilotProgram, loading: programLoading } = usePilotPrograms();
  const { canCreateSite, canDeleteSite, canManageSiteTemplates, canViewAuditLog } = useUserRole({ programId });
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isProgramDetailsModalOpen, setIsProgramDetailsModalOpen] = useState(false);
  
  // Fetch selected program if not already in state
  useEffect(() => {
    const loadPilotProgram = async () => {
      if (!programId) return;
      
      // Check if we already have the program in state
      if (selectedProgram && selectedProgram.program_id === programId) {
        return;
      }
      
      const program = await fetchPilotProgram(programId);
      if (program) {
        setSelectedProgram(program);
      } else {
        navigate('/programs');
      }
    };

    loadPilotProgram();
  }, [programId, selectedProgram, setSelectedProgram, fetchPilotProgram, navigate]);

  const handleSiteSelect = (site: Site) => {
    setSelectedSite(site);
    navigate(`/programs/${programId}/sites/${site.site_id}`);
  };
  
  const handleAddSite = () => {
    if (canCreateSite) {
      setIsModalOpen(true);
    } else {
      setPermissionMessage("You don't have permission to create new sites. Please contact your program administrator for access.");
      setShowPermissionModal(true);
    }
  };
  
  const handleDeleteSite = async (site: Site) => {
    if (!canDeleteSite) {
      setPermissionMessage("You don't have permission to delete sites. Please contact your program administrator for access.");
      setShowPermissionModal(true);
      return;
    }

    setIsDeleting(true);
    try {
      const success = await deleteSite(site.site_id);
      if (success) {
        toast.success(`Site "${site.name}" deleted successfully`);
      }
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleManageSiteTemplate = (site: Site) => {
    if (canManageSiteTemplates) {
      navigate(`/programs/${programId}/sites/${site.site_id}/template`);
    } else {
      setPermissionMessage("You don't have permission to manage site templates. Please contact your program administrator for access.");
      setShowPermissionModal(true);
    }
  };
  
  // Handle site creation callback
  const handleSiteCreated = (site: any) => {
    console.log('Site created:', site);
    // Refresh the sites list
    fetchSites();
  };

  const handleViewProgramAuditLog = () => {
    if (canViewAuditLog) {
      navigate(`/programs/${programId}/audit-log`);
    } else {
      setPermissionMessage("You don't have permission to view the audit log. Please contact your program administrator for access.");
      setShowPermissionModal(true);
    }
  };

  const filteredSites = searchQuery 
    ? sites.filter(site => 
        site.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sites;

  if (sitesLoading || programLoading || !selectedProgram) {
    return <LoadingScreen />;
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate('/programs')}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back to programs"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div className="flex-grow">
          <h1 className="text-2xl font-bold text-gray-900">{selectedProgram.name}</h1>
          <p className="text-gray-600 mt-1">Select a Facility</p>
        </div>
        <div className="flex space-x-2">
          {canViewAuditLog && (
            <Button
              variant="outline"
              icon={<History size={18} />}
              onClick={handleViewProgramAuditLog}
              testId="view-program-audit-log"
            >
              Audit Log
            </Button>
          )}
          
          {selectedProgram && (
            <Button
              variant="outline"
              icon={<Info size={18} />}
              onClick={() => setIsProgramDetailsModalOpen(true)}
              testId="view-program-details-button"
            >
              Program Details
            </Button>
          )}
          
          <Button 
            variant="primary" 
            icon={<Plus size={18} />}
            onClick={handleAddSite}
            testId="new-site-button"
          >
            New Site
          </Button>
        </div>
      </div>
      
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <Input
          type="text"
          placeholder="Search sites..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          testId="site-search-input"
        />
      </div>

      {sites.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200" data-testid="empty-sites-message">
          <Building className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">No sites yet</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by adding your first site to this program.</p>
          <div className="mt-6">
            <Button 
              variant="primary"
              icon={<Plus size={16} />}
              onClick={handleAddSite}
              testId="empty-new-site-button"
            >
              Add New Site
            </Button>
          </div>
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200" data-testid="no-search-results-message">
          <p className="text-gray-600">No sites match your search</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => setSearchQuery('')}
            testId="clear-search-button"
          >
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="sites-grid">
          {filteredSites.map(site => (
            <SiteCard
              key={site.site_id}
              site={site}
              onView={handleSiteSelect}
              onDelete={handleDeleteSite}
              onManageTemplate={handleManageSiteTemplate}
              canDelete={canDeleteSite}
              canManageTemplate={canManageSiteTemplates}
              canViewAuditLog={canViewAuditLog}
              programId={programId || ''}
              testId={`site-card-${site.site_id}`}
            />
          ))}
        </div>
      )}

      <NewSiteModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        programId={programId || ''}
        onSiteCreated={handleSiteCreated}
      />
      
      <PermissionModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        title="Insufficient Permissions"
        message={permissionMessage}
      />

      {selectedProgram && (
        <ProgramDetailsModal
          isOpen={isProgramDetailsModalOpen}
          onClose={() => setIsProgramDetailsModalOpen(false)}
          program={selectedProgram}
        />
      )}
    </div>
  );
};

export default SitesPage;