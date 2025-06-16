import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { PilotProgram } from '../lib/types';
import { Plus, Search, Calendar, Leaf, CheckCircle, XCircle, Info, ArrowLeft } from 'lucide-react';
import Card, { CardContent, CardFooter, CardHeader } from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import LoadingScreen from '../components/common/LoadingScreen';
import { format } from 'date-fns';
import NewPilotProgramModal from '../components/pilotPrograms/NewPilotProgramModal';
import ProgramDetailsModal from '../components/pilotPrograms/ProgramDetailsModal';
import usePilotPrograms from '../hooks/usePilotPrograms';

const PilotProgramsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { setSelectedProgram, setLoading } = usePilotProgramStore();
  const { programs, isLoading, refetchPrograms } = usePilotPrograms();
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewProgramModalOpen, setIsNewProgramModalOpen] = useState(false);
  const [selectedProgram, setSelectedProgramLocal] = useState<PilotProgram | null>(null);
  
  const handleProgramSelect = (program: PilotProgram) => {
    setSelectedProgram(program);
    navigate(`/programs/${program.program_id}/sites`);
  };

  const handleProgramDetails = (program: PilotProgram, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProgramLocal(program);
  };

  const filteredPrograms = programs.filter(program => 
    program.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    program.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate('/home')}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back to home"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div className="flex-grow">
          <h1 className="text-2xl font-bold text-gray-900">Pilot Programs</h1>
          <p className="text-gray-600 mt-1">Select a program to begin work</p>
        </div>
        <Button 
          variant="primary" 
          icon={<Plus size={18} />}
          onClick={() => setIsNewProgramModalOpen(true)}
          testId="new-program-button"
        >
          New Pilot Program
        </Button>
      </div>
      
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <Input
          type="text"
          placeholder="Search pilot programs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          testId="program-search-input"
        />
      </div>

      {programs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200" data-testid="empty-programs-message">
          <Leaf className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">No pilot programs yet</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating your first pilot program.</p>
          <div className="mt-6">
            <Button 
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setIsNewProgramModalOpen(true)}
              testId="empty-new-program-button"
            >
              New Pilot Program
            </Button>
          </div>
        </div>
      ) : filteredPrograms.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200" data-testid="no-search-results-message">
          <p className="text-gray-600">No programs match your search</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="programs-grid">
          {filteredPrograms.map(program => (
            <Card 
              key={program.program_id}
              hoverable
              onClick={() => handleProgramSelect(program)}
              className="h-full"
              testId={`program-card-${program.program_id}`}
            >
              <CardHeader testId={`program-header-${program.program_id}`}>
                <div className="flex justify-between items-start">
                  <h3 className="text-lg font-semibold text-gray-900 truncate" title={program.name}>
                    {program.name}
                  </h3>
                  <div className="flex items-center space-x-2">
                    <span className={`pill ${
                      program.status === 'active' 
                        ? 'bg-success-100 text-success-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`} data-testid={`program-status-${program.program_id}`}>
                      {program.status === 'active' ? (
                        <CheckCircle size={12} className="mr-1" />
                      ) : (
                        <XCircle size={12} className="mr-1" />
                      )}
                      {program.status.charAt(0).toUpperCase() + program.status.slice(1)}
                    </span>
                    <button 
                      className="text-gray-500 hover:text-gray-700"
                      onClick={(e) => handleProgramDetails(program, e)}
                      aria-label="View program details"
                      data-testid={`program-details-button-${program.program_id}`}
                    >
                      <Info size={16} />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent testId={`program-content-${program.program_id}`}>
                <p className="text-gray-600 mb-4 line-clamp-3" title={program.description}>
                  {program.description}
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center text-gray-600">
                    <Calendar size={16} className="mr-1 flex-shrink-0" />
                    <span className="truncate" title={`From: ${format(new Date(program.start_date), 'PP')}`}>
                      From: {format(new Date(program.start_date), 'PP')}
                    </span>
                  </div>
                  <div className="flex items-center text-gray-600">
                    <Calendar size={16} className="mr-1 flex-shrink-0" />
                    <span className="truncate" title={`To: ${format(new Date(program.end_date), 'PP')}`}>
                      To: {format(new Date(program.end_date), 'PP')}
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between text-sm text-gray-500" testId={`program-footer-${program.program_id}`}>
                <span>{program.total_sites} Sites</span>
                <span>{program.total_submissions} Submissions</span>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <NewPilotProgramModal 
        isOpen={isNewProgramModalOpen} 
        onClose={() => setIsNewProgramModalOpen(false)} 
        onProgramCreated={refetchPrograms}
      />
      
      {selectedProgram && (
        <ProgramDetailsModal
          isOpen={!!selectedProgram}
          onClose={() => setSelectedProgramLocal(null)}
          program={selectedProgram}
          onDelete={refetchPrograms}
        />
      )}
    </div>
  );
};

export default PilotProgramsPage;