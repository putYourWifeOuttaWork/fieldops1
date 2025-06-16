import { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { X, Building, Leaf, ArrowRight, ArrowLeft } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Card, { CardContent } from '../common/Card';
import { useSites } from '../../hooks/useSites';
import { usePilotProgramStore } from '../../stores/pilotProgramStore';
import { toast } from 'react-toastify';
import NewSitePetriTemplateForm from './NewSitePetriTemplateForm';
import NewSiteGasifierTemplateForm from './NewSiteGasifierTemplateForm';
import { PetriDefaults, GasifierDefaults } from '../../lib/types';
import { v4 as uuidv4 } from 'uuid';

interface NewSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  programId: string;
  onSiteCreated?: (site: any) => void;
}

// Define the steps in the site creation process
type Step = 'basic' | 'dimensions' | 'facility' | 'environment' | 'templates';

// Define the validation schema for the basic info step
const BasicInfoSchema = Yup.object().shape({
  name: Yup.string()
    .required('Site name is required')
    .min(2, 'Site name must be at least 2 characters')
    .max(100, 'Site name must be at most 100 characters'),
  type: Yup.string()
    .required('Site type is required')
    .oneOf(['Greenhouse', 'Storage', 'Transport', 'Production Facility'], 'Invalid site type'),
});

// Define the validation schema for the dimensions step
const DimensionsSchema = Yup.object().shape({
  length: Yup.number()
    .nullable()
    .min(1, 'Length must be greater than 0'),
  width: Yup.number()
    .nullable()
    .min(1, 'Width must be greater than 0'),
  height: Yup.number()
    .nullable()
    .min(1, 'Height must be greater than 0'),
  minEfficaciousGasifierDensity: Yup.number()
    .nullable()
    .min(100, 'Gasifier density must be at least 100 sq ft per bag')
    .max(10000, 'Gasifier density is too large'),
});

// Define the validation schema for the facility details step
const FacilitySchema = Yup.object().shape({
  primaryFunction: Yup.string()
    .nullable(),
  constructionMaterial: Yup.string()
    .nullable(),
  insulationType: Yup.string()
    .nullable(),
});

// Define the validation schema for the environmental controls step
const EnvironmentSchema = Yup.object().shape({
  hvacSystemPresent: Yup.boolean()
    .default(false),
  hvacSystemType: Yup.string()
    .nullable()
    .when('hvacSystemPresent', {
      is: true,
      then: (schema) => schema.required('HVAC system type is required when HVAC is present'),
    }),
  irrigationSystemType: Yup.string()
    .nullable(),
  lightingSystem: Yup.string()
    .nullable(),
  ventilationStrategy: Yup.string()
    .nullable(),
});

const NewSiteModal = ({ isOpen, onClose, programId, onSiteCreated }: NewSiteModalProps) => {
  const { createSite, loading } = useSites(programId);
  const { selectedProgram } = usePilotProgramStore();
  const [currentStep, setCurrentStep] = useState<Step>('basic');
  const [petriTemplates, setPetriTemplates] = useState<(PetriDefaults & { id?: string })[]>([]);
  const [gasifierTemplates, setGasifierTemplates] = useState<(GasifierDefaults & { id?: string })[]>([]);
  
  // Reset the form and step when the modal is opened/closed
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('basic');
      formik.resetForm();
      setPetriTemplates([]);
      setGasifierTemplates([]);
    }
  }, [isOpen]);
  
  // Initialize the form with Formik
  const formik = useFormik({
    initialValues: {
      // Basic info
      name: '',
      type: 'Greenhouse',
      
      // Dimensions
      length: '',
      width: '',
      height: '',
      minEfficaciousGasifierDensity: 2000,
      
      // Facility details
      primaryFunction: '',
      constructionMaterial: '',
      insulationType: '',
      
      // Environmental controls
      hvacSystemPresent: false,
      hvacSystemType: '',
      irrigationSystemType: '',
      lightingSystem: '',
      ventilationStrategy: '',
      
      // Interior features
      interiorWorkingSurfaceTypes: [] as string[],
      microbialRiskZone: 'Medium',
      
      // Airflow dynamics
      hasDeadZones: false,
      numRegularlyOpenedPorts: '',
      numVents: '',
      ventPlacements: [] as string[],
    },
    validationSchema: (() => {
      switch (currentStep) {
        case 'basic':
          return BasicInfoSchema;
        case 'dimensions':
          return DimensionsSchema;
        case 'facility':
          return FacilitySchema;
        case 'environment':
          return EnvironmentSchema;
        default:
          return Yup.object();
      }
    })(),
    validateOnMount: false,
    validateOnChange: true,
    onSubmit: async (values) => {
      try {
        // Prepare petri and gasifier templates
        const petriDefaultsArray = petriTemplates.map(template => {
          const { id, ...rest } = template;
          return rest;
        });
        
        const gasifierDefaultsArray = gasifierTemplates.map(template => {
          const { id, ...rest } = template;
          return rest;
        });
        
        // Create the site
        const site = await createSite(
          values.name,
          values.type,
          programId,
          undefined, // No submission defaults for now
          petriDefaultsArray.length > 0 ? petriDefaultsArray : undefined,
          gasifierDefaultsArray.length > 0 ? gasifierDefaultsArray : undefined,
          {
            // Physical attributes
            length: values.length ? Number(values.length) : undefined,
            width: values.width ? Number(values.width) : undefined,
            height: values.height ? Number(values.height) : undefined,
            numVents: values.numVents ? Number(values.numVents) : undefined,
            ventPlacements: values.ventPlacements.length > 0 ? values.ventPlacements : undefined,
            
            // Facility details
            primaryFunction: values.primaryFunction || undefined,
            constructionMaterial: values.constructionMaterial || undefined,
            insulationType: values.insulationType || undefined,
            
            // Environmental controls
            hvacSystemPresent: values.hvacSystemPresent,
            hvacSystemType: values.hvacSystemType || undefined,
            irrigationSystemType: values.irrigationSystemType || undefined,
            lightingSystem: values.lightingSystem || undefined,
            
            // Interior features
            interiorWorkingSurfaceTypes: values.interiorWorkingSurfaceTypes.length > 0 ? values.interiorWorkingSurfaceTypes : undefined,
            microbialRiskZone: values.microbialRiskZone || 'Medium',
            
            // Airflow dynamics
            hasDeadZones: values.hasDeadZones,
            numRegularlyOpenedPorts: values.numRegularlyOpenedPorts ? Number(values.numRegularlyOpenedPorts) : undefined,
            
            // Gasifier density
            minEfficaciousGasifierDensity: values.minEfficaciousGasifierDensity ? Number(values.minEfficaciousGasifierDensity) : 2000,
            
            // Ventilation strategy
            ventilationStrategy: values.ventilationStrategy || undefined,
          }
        );
        
        if (site) {
          toast.success(`Site "${values.name}" created successfully`);
          if (onSiteCreated) {
            onSiteCreated(site);
          }
          onClose();
        }
      } catch (error) {
        console.error('Error creating site:', error);
        toast.error('Failed to create site');
      }
    },
  });
  
  // Handle next step
  const handleNextStep = async () => {
    // Validate the current step
    try {
      await formik.validateForm();
      
      // Check for errors in the current step's fields
      const errors = formik.errors;
      const touched = formik.touched;
      let hasErrors = false;
      
      switch (currentStep) {
        case 'basic':
          if (errors.name || errors.type) {
            hasErrors = true;
            // Touch the fields to show errors
            formik.setFieldTouched('name', true);
            formik.setFieldTouched('type', true);
          }
          break;
        case 'dimensions':
          if (errors.length || errors.width || errors.height || errors.minEfficaciousGasifierDensity) {
            hasErrors = true;
            // Touch the fields to show errors
            if (formik.values.length) formik.setFieldTouched('length', true);
            if (formik.values.width) formik.setFieldTouched('width', true);
            if (formik.values.height) formik.setFieldTouched('height', true);
            formik.setFieldTouched('minEfficaciousGasifierDensity', true);
          }
          break;
        case 'facility':
          if (errors.primaryFunction || errors.constructionMaterial || errors.insulationType) {
            hasErrors = true;
          }
          break;
        case 'environment':
          if (errors.hvacSystemType || errors.irrigationSystemType || errors.lightingSystem || errors.ventilationStrategy) {
            hasErrors = true;
            // If HVAC is present, touch the HVAC type field to show errors
            if (formik.values.hvacSystemPresent) {
              formik.setFieldTouched('hvacSystemType', true);
            }
          }
          break;
      }
      
      if (hasErrors) {
        return;
      }
      
      // Move to the next step
      switch (currentStep) {
        case 'basic':
          setCurrentStep('dimensions');
          break;
        case 'dimensions':
          setCurrentStep('facility');
          break;
        case 'facility':
          setCurrentStep('environment');
          break;
        case 'environment':
          setCurrentStep('templates');
          break;
        case 'templates':
          // Submit the form
          await formik.submitForm();
          break;
      }
    } catch (error) {
      console.error('Validation error:', error);
    }
  };
  
  // Handle previous step
  const handlePrevStep = () => {
    switch (currentStep) {
      case 'dimensions':
        setCurrentStep('basic');
        break;
      case 'facility':
        setCurrentStep('dimensions');
        break;
      case 'environment':
        setCurrentStep('facility');
        break;
      case 'templates':
        setCurrentStep('environment');
        break;
    }
  };
  
  // Handle adding a petri template
  const handleAddPetriTemplate = () => {
    const newTemplate: PetriDefaults & { id: string } = {
      id: uuidv4(),
      petri_code: `PETRI-${Math.floor(Math.random() * 1000)}`,
      plant_type: 'Other Fresh Perishable',
      fungicide_used: 'No',
      surrounding_water_schedule: 'Daily',
      notes: '',
    };
    setPetriTemplates([...petriTemplates, newTemplate]);
  };
  
  // Handle removing a petri template
  const handleRemovePetriTemplate = (index: number) => {
    const updatedTemplates = [...petriTemplates];
    updatedTemplates.splice(index, 1);
    setPetriTemplates(updatedTemplates);
  };
  
  // Handle updating a petri template
  const handleUpdatePetriTemplate = (index: number, updatedTemplate: PetriDefaults) => {
    const updatedTemplates = [...petriTemplates];
    updatedTemplates[index] = { ...updatedTemplates[index], ...updatedTemplate };
    setPetriTemplates(updatedTemplates);
  };
  
  // Handle adding a gasifier template
  const handleAddGasifierTemplate = () => {
    const newTemplate: GasifierDefaults & { id: string } = {
      id: uuidv4(),
      gasifier_code: `GAS-${Math.floor(Math.random() * 1000)}`,
      chemical_type: 'CLO2',
      placement_height: 'Medium',
      directional_placement: 'Center-Center',
      placement_strategy: 'Centralized Coverage',
      notes: '',
    };
    setGasifierTemplates([...gasifierTemplates, newTemplate]);
  };
  
  // Handle removing a gasifier template
  const handleRemoveGasifierTemplate = (index: number) => {
    const updatedTemplates = [...gasifierTemplates];
    updatedTemplates.splice(index, 1);
    setGasifierTemplates(updatedTemplates);
  };
  
  // Handle updating a gasifier template
  const handleUpdateGasifierTemplate = (index: number, updatedTemplate: GasifierDefaults) => {
    const updatedTemplates = [...gasifierTemplates];
    updatedTemplates[index] = { ...updatedTemplates[index], ...updatedTemplate };
    setGasifierTemplates(updatedTemplates);
  };
  
  // Calculate square footage and recommended gasifier bags
  const squareFootage = formik.values.length && formik.values.width 
    ? Number(formik.values.length) * Number(formik.values.width) 
    : null;
    
  const recommendedGasifierBags = squareFootage && formik.values.minEfficaciousGasifierDensity
    ? Math.ceil(squareFootage / Number(formik.values.minEfficaciousGasifierDensity))
    : null;
  
  // Check if the Next button should be disabled
  const isNextDisabled = () => {
    switch (currentStep) {
      case 'basic':
        return !formik.values.name || !formik.values.type || !!formik.errors.name || !!formik.errors.type;
      case 'dimensions':
        // Allow proceeding if no dimensions are entered, or if they are valid
        return (formik.values.length || formik.values.width || formik.values.height) && 
               (!!formik.errors.length || !!formik.errors.width || !!formik.errors.height || !!formik.errors.minEfficaciousGasifierDensity);
      case 'facility':
        // Allow proceeding if no facility details are entered, or if they are valid
        return false; // No required fields in this step
      case 'environment':
        // Only require HVAC type if HVAC is present
        return formik.values.hvacSystemPresent && !formik.values.hvacSystemType;
      case 'templates':
        return loading;
      default:
        return false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-xl font-semibold">Create New Site</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close modal"
            type="button"
          >
            <X size={24} />
          </button>
        </div>
        
        {/* Step indicator */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div 
              className={`flex items-center ${currentStep === 'basic' ? 'text-primary-600' : 'text-gray-400'}`}
              onClick={() => currentStep !== 'basic' && setCurrentStep('basic')}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'basic' ? 'bg-primary-100 text-primary-600' : 'bg-gray-100'}`}>
                <Building size={16} />
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:inline">Basic Info</span>
            </div>
            <div className="flex-1 h-px bg-gray-200 mx-2"></div>
            <div 
              className={`flex items-center ${currentStep === 'dimensions' ? 'text-primary-600' : 'text-gray-400'}`}
              onClick={() => currentStep !== 'dimensions' && currentStep !== 'basic' && setCurrentStep('dimensions')}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'dimensions' ? 'bg-primary-100 text-primary-600' : 'bg-gray-100'}`}>
                <Leaf size={16} />
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:inline">Dimensions & Density</span>
            </div>
            <div className="flex-1 h-px bg-gray-200 mx-2"></div>
            <div 
              className={`flex items-center ${currentStep === 'facility' ? 'text-primary-600' : 'text-gray-400'}`}
              onClick={() => currentStep !== 'facility' && currentStep !== 'basic' && currentStep !== 'dimensions' && setCurrentStep('facility')}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'facility' ? 'bg-primary-100 text-primary-600' : 'bg-gray-100'}`}>
                <Building size={16} />
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:inline">Facility Details</span>
            </div>
            <div className="flex-1 h-px bg-gray-200 mx-2"></div>
            <div 
              className={`flex items-center ${currentStep === 'environment' ? 'text-primary-600' : 'text-gray-400'}`}
              onClick={() => currentStep !== 'environment' && currentStep !== 'basic' && currentStep !== 'dimensions' && currentStep !== 'facility' && setCurrentStep('environment')}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'environment' ? 'bg-primary-100 text-primary-600' : 'bg-gray-100'}`}>
                <Leaf size={16} />
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:inline">Environmental Controls</span>
            </div>
            <div className="flex-1 h-px bg-gray-200 mx-2"></div>
            <div 
              className={`flex items-center ${currentStep === 'templates' ? 'text-primary-600' : 'text-gray-400'}`}
              onClick={() => currentStep === 'templates' && setCurrentStep('templates')}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'templates' ? 'bg-primary-100 text-primary-600' : 'bg-gray-100'}`}>
                <Leaf size={16} />
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:inline">Observation Templates</span>
            </div>
          </div>
        </div>
        
        <div className="p-4">
          <form onSubmit={(e) => { e.preventDefault(); handleNextStep(); }}>
            {/* Basic Info Step */}
            {currentStep === 'basic' && (
              <div className="space-y-4 animate-fade-in">
                <Input
                  label="Site Name"
                  id="name"
                  name="name"
                  placeholder="Enter site name"
                  value={formik.values.name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.name && formik.errors.name ? formik.errors.name : undefined}
                  autoFocus
                />
                
                <div>
                  <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                    Site Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    value={formik.values.type}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                  >
                    <option value="Greenhouse">Greenhouse</option>
                    <option value="Storage">Storage</option>
                    <option value="Transport">Transport</option>
                    <option value="Production Facility">Production Facility</option>
                  </select>
                  {formik.touched.type && formik.errors.type && (
                    <p className="mt-1 text-sm text-error-600">{formik.errors.type}</p>
                  )}
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h3 className="font-medium mb-2">Program Information</h3>
                  <p className="text-sm text-gray-600">
                    This site will be created in the program: <span className="font-medium">{selectedProgram?.name}</span>
                  </p>
                </div>
              </div>
            )}
            
            {/* Dimensions & Density Step */}
            {currentStep === 'dimensions' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="font-medium text-lg">Site Dimensions</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Enter the physical dimensions of your site. This will help calculate the optimal gasifier placement.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Length (feet)"
                    id="length"
                    name="length"
                    type="number"
                    placeholder="Enter length"
                    value={formik.values.length}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.length && formik.errors.length ? formik.errors.length : undefined}
                  />
                  
                  <Input
                    label="Width (feet)"
                    id="width"
                    name="width"
                    type="number"
                    placeholder="Enter width"
                    value={formik.values.width}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.width && formik.errors.width ? formik.errors.width : undefined}
                  />
                  
                  <Input
                    label="Height (feet)"
                    id="height"
                    name="height"
                    type="number"
                    placeholder="Enter height"
                    value={formik.values.height}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.height && formik.errors.height ? formik.errors.height : undefined}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <Input
                    label="Min. Efficacious Gasifier Density (sq ft per bag)"
                    id="minEfficaciousGasifierDensity"
                    name="minEfficaciousGasifierDensity"
                    type="number"
                    placeholder="Default: 2000"
                    value={formik.values.minEfficaciousGasifierDensity}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.minEfficaciousGasifierDensity && formik.errors.minEfficaciousGasifierDensity ? formik.errors.minEfficaciousGasifierDensity : undefined}
                  />
                  
                  {squareFootage && recommendedGasifierBags && (
                    <div className="border rounded-md p-3 bg-primary-50 border-primary-100">
                      <h4 className="font-medium text-primary-800 mb-1">Gasifier Recommendations</h4>
                      <p className="text-sm text-primary-700">
                        Based on the dimensions provided ({formik.values.length} x {formik.values.width} = {squareFootage} sq ft), and the efficacious density of 1 bag per {formik.values.minEfficaciousGasifierDensity} sq ft, we recommend using <span className="font-bold">{recommendedGasifierBags} gasifier bags</span> for optimal coverage.
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Airflow Dynamics
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center mb-2">
                        <input
                          id="hasDeadZones"
                          name="hasDeadZones"
                          type="checkbox"
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          checked={formik.values.hasDeadZones}
                          onChange={formik.handleChange}
                        />
                        <label htmlFor="hasDeadZones" className="ml-2 block text-sm text-gray-900">
                          Has Dead Zones (areas with poor air circulation)
                        </label>
                      </div>
                      
                      <Input
                        label="Number of Regularly Opened Ports/Doors"
                        id="numRegularlyOpenedPorts"
                        name="numRegularlyOpenedPorts"
                        type="number"
                        placeholder="Enter number"
                        value={formik.values.numRegularlyOpenedPorts}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        error={formik.touched.numRegularlyOpenedPorts && formik.errors.numRegularlyOpenedPorts ? formik.errors.numRegularlyOpenedPorts : undefined}
                      />
                    </div>
                    
                    <div>
                      <Input
                        label="Number of Ventilation Points"
                        id="numVents"
                        name="numVents"
                        type="number"
                        placeholder="Enter number of vents"
                        value={formik.values.numVents}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        error={formik.touched.numVents && formik.errors.numVents ? formik.errors.numVents : undefined}
                      />
                      
                      <div className="mt-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Vent Placements
                        </label>
                        <div className="space-y-2 border border-gray-300 rounded-md p-3">
                          {['Ceiling-Center', 'Ceiling-Perimeter', 'Upper-Walls', 'Lower-Walls', 'Floor-Level'].map(placement => (
                            <div key={placement} className="flex items-center">
                              <input
                                id={`vent-${placement}`}
                                name="ventPlacements"
                                type="checkbox"
                                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                value={placement}
                                checked={formik.values.ventPlacements.includes(placement)}
                                onChange={(e) => {
                                  const currentValues = [...formik.values.ventPlacements];
                                  if (e.target.checked) {
                                    formik.setFieldValue('ventPlacements', [...currentValues, placement]);
                                  } else {
                                    formik.setFieldValue(
                                      'ventPlacements',
                                      currentValues.filter(val => val !== placement)
                                    );
                                  }
                                }}
                              />
                              <label htmlFor={`vent-${placement}`} className="ml-2 text-sm text-gray-700">
                                {placement}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Facility Details Step */}
            {currentStep === 'facility' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="font-medium text-lg">Facility Details</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Provide information about the facility's construction and purpose.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="primaryFunction" className="block text-sm font-medium text-gray-700 mb-1">
                      Primary Function
                    </label>
                    <select
                      id="primaryFunction"
                      name="primaryFunction"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={formik.values.primaryFunction}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    >
                      <option value="">Select primary function</option>
                      <option value="Growing">Growing</option>
                      <option value="Drying">Drying</option>
                      <option value="Packaging">Packaging</option>
                      <option value="Storage">Storage</option>
                      <option value="Research">Research</option>
                      <option value="Retail">Retail</option>
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="constructionMaterial" className="block text-sm font-medium text-gray-700 mb-1">
                      Construction Material
                    </label>
                    <select
                      id="constructionMaterial"
                      name="constructionMaterial"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={formik.values.constructionMaterial}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    >
                      <option value="">Select construction material</option>
                      <option value="Glass">Glass</option>
                      <option value="Polycarbonate">Polycarbonate</option>
                      <option value="Metal">Metal</option>
                      <option value="Concrete">Concrete</option>
                      <option value="Wood">Wood</option>
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="insulationType" className="block text-sm font-medium text-gray-700 mb-1">
                      Insulation Type
                    </label>
                    <select
                      id="insulationType"
                      name="insulationType"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={formik.values.insulationType}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    >
                      <option value="">Select insulation type</option>
                      <option value="None">None</option>
                      <option value="Basic">Basic</option>
                      <option value="Moderate">Moderate</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="ventilationStrategy" className="block text-sm font-medium text-gray-700 mb-1">
                      Ventilation Strategy
                    </label>
                    <select
                      id="ventilationStrategy"
                      name="ventilationStrategy"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={formik.values.ventilationStrategy}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    >
                      <option value="">Select ventilation strategy</option>
                      <option value="Cross-Ventilation">Cross-Ventilation</option>
                      <option value="Positive Pressure">Positive Pressure</option>
                      <option value="Negative Pressure">Negative Pressure</option>
                      <option value="Neutral Sealed">Neutral Sealed</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Interior Working Surface Types
                  </label>
                  <div className="space-y-2 border border-gray-300 rounded-md p-3">
                    {['Stainless Steel', 'Unfinished Concrete', 'Wood', 'Plastic', 'Granite', 'Other Non-Absorbative'].map(surface => (
                      <div key={surface} className="flex items-center">
                        <input
                          id={`surface-${surface}`}
                          name="interiorWorkingSurfaceTypes"
                          type="checkbox"
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          value={surface}
                          checked={formik.values.interiorWorkingSurfaceTypes.includes(surface)}
                          onChange={(e) => {
                            const currentValues = [...formik.values.interiorWorkingSurfaceTypes];
                            if (e.target.checked) {
                              formik.setFieldValue('interiorWorkingSurfaceTypes', [...currentValues, surface]);
                            } else {
                              formik.setFieldValue(
                                'interiorWorkingSurfaceTypes',
                                currentValues.filter(val => val !== surface)
                              );
                            }
                          }}
                        />
                        <label htmlFor={`surface-${surface}`} className="ml-2 text-sm text-gray-700">
                          {surface}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label htmlFor="microbialRiskZone" className="block text-sm font-medium text-gray-700 mb-1">
                    Microbial Risk Zone
                  </label>
                  <select
                    id="microbialRiskZone"
                    name="microbialRiskZone"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    value={formik.values.microbialRiskZone}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>
            )}
            
            {/* Environmental Controls Step */}
            {currentStep === 'environment' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="font-medium text-lg">HVAC System</h3>
                
                <div className="flex items-center mb-4">
                  <input
                    id="hvacSystemPresent"
                    name="hvacSystemPresent"
                    type="checkbox"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    checked={formik.values.hvacSystemPresent}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                  />
                  <label htmlFor="hvacSystemPresent" className="ml-2 block text-sm text-gray-900">
                    HVAC System Present
                  </label>
                </div>
                
                {formik.values.hvacSystemPresent && (
                  <div>
                    <label htmlFor="hvacSystemType" className="block text-sm font-medium text-gray-700 mb-1">
                      HVAC System Type
                    </label>
                    <select
                      id="hvacSystemType"
                      name="hvacSystemType"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={formik.values.hvacSystemType}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    >
                      <option value="">Select HVAC system type</option>
                      <option value="Centralized">Centralized</option>
                      <option value="Distributed">Distributed</option>
                      <option value="Evaporative Cooling">Evaporative Cooling</option>
                      <option value="None">None</option>
                    </select>
                    {formik.touched.hvacSystemType && formik.errors.hvacSystemType && (
                      <p className="mt-1 text-sm text-error-600">{formik.errors.hvacSystemType}</p>
                    )}
                  </div>
                )}
                
                <h3 className="font-medium text-lg mt-6">Other Systems</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="irrigationSystemType" className="block text-sm font-medium text-gray-700 mb-1">
                      Irrigation System Type
                    </label>
                    <select
                      id="irrigationSystemType"
                      name="irrigationSystemType"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={formik.values.irrigationSystemType}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    >
                      <option value="">Select irrigation system type</option>
                      <option value="Drip">Drip</option>
                      <option value="Sprinkler">Sprinkler</option>
                      <option value="Hydroponic">Hydroponic</option>
                      <option value="Manual">Manual</option>
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="lightingSystem" className="block text-sm font-medium text-gray-700 mb-1">
                      Lighting System
                    </label>
                    <select
                      id="lightingSystem"
                      name="lightingSystem"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={formik.values.lightingSystem}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    >
                      <option value="">Select lighting system</option>
                      <option value="Natural Light Only">Natural Light Only</option>
                      <option value="LED">LED</option>
                      <option value="HPS">HPS</option>
                      <option value="Fluorescent">Fluorescent</option>
                    </select>
                  </div>
                </div>
                
                {squareFootage && recommendedGasifierBags && (
                  <div className="mt-4 p-3 bg-primary-50 border border-primary-100 rounded-md">
                    <div className="flex items-center mb-2">
                      <Leaf className="text-primary-600 mr-2" size={18} />
                      <h4 className="font-medium text-primary-800">Gasifier Recommendations</h4>
                    </div>
                    <p className="text-sm text-primary-700">
                      Based on the dimensions provided ({formik.values.length} x {formik.values.width} = {squareFootage} sq ft), and the efficacious density of 1 bag per {formik.values.minEfficaciousGasifierDensity} sq ft, we recommend using <span className="font-bold">{recommendedGasifierBags} gasifier bags</span> for optimal coverage.
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* Templates Step */}
            {currentStep === 'templates' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h3 className="font-medium text-lg mb-2">Petri Sample Templates</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Define default petri sample templates for this site. These will be used as starting points when creating new submissions.
                  </p>
                  
                  {petriTemplates.length > 0 ? (
                    <div className="space-y-4">
                      {petriTemplates.map((template, index) => (
                        <NewSitePetriTemplateForm
                          key={template.id}
                          index={index}
                          template={template}
                          onUpdate={(data) => handleUpdatePetriTemplate(index, data)}
                          onRemove={() => handleRemovePetriTemplate(index)}
                          testId={`petri-template-${index}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-gray-500">No petri templates defined yet</p>
                    </div>
                  )}
                  
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddPetriTemplate}
                      testId="add-petri-template-button"
                    >
                      Add Petri Template
                    </Button>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium text-lg mb-2">Gasifier Sample Templates</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Define default gasifier sample templates for this site. These will be used as starting points when creating new submissions.
                  </p>
                  
                  {gasifierTemplates.length > 0 ? (
                    <div className="space-y-4">
                      {gasifierTemplates.map((template, index) => (
                        <NewSiteGasifierTemplateForm
                          key={template.id}
                          index={index}
                          template={template}
                          onUpdate={(data) => handleUpdateGasifierTemplate(index, data)}
                          onRemove={() => handleRemoveGasifierTemplate(index)}
                          testId={`gasifier-template-${index}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-gray-500">No gasifier templates defined yet</p>
                    </div>
                  )}
                  
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddGasifierTemplate}
                      testId="add-gasifier-template-button"
                    >
                      Add Gasifier Template
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-between mt-6 pt-4 border-t">
              {currentStep !== 'basic' ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrevStep}
                  icon={<ArrowLeft size={16} />}
                >
                  Back
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                >
                  Cancel
                </Button>
              )}
              
              <Button
                type="button"
                variant="primary"
                onClick={handleNextStep}
                disabled={isNextDisabled() || loading}
                isLoading={currentStep === 'templates' && loading}
                icon={currentStep !== 'templates' ? <ArrowRight size={16} /> : undefined}
              >
                {currentStep === 'templates' ? 'Create Site' : 'Next'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewSiteModal;