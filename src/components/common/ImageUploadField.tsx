import { useState, useEffect, useRef } from 'react';
import { Upload, Check, AlertCircle, XCircle } from 'lucide-react';
import offlineStorage from '../../utils/offlineStorage';
import useWeather from '../../hooks/useWeather';

interface ImageUploadFieldProps {
  label: string;
  initialImageUrl?: string;
  initialTempImageKey?: string;
  submissionSessionId: string;
  imageId: string;
  onChange: (data: {
    file: File | null;
    tempImageKey?: string;
    imageUrl?: string;
    outdoor_temperature?: number;
    outdoor_humidity?: number;
    isDirty: boolean;
  }) => void;
  onClear?: () => void;
  disabled?: boolean;
  testId?: string;
  className?: string;
}

const ImageUploadField = ({
  label,
  initialImageUrl,
  initialTempImageKey,
  submissionSessionId,
  imageId,
  onChange,
  onClear,
  disabled = false,
  testId,
  className = ''
}: ImageUploadFieldProps) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(initialImageUrl || null);
  const [imageTouched, setImageTouched] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tempImageKey, setTempImageKey] = useState<string | undefined>(initialTempImageKey);
  const [showClearButton, setShowClearButton] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Weather hook for environmental data capture
  const { currentConditions } = useWeather();
  
  const isExistingImage = initialImageUrl !== undefined && initialImageUrl !== null;
  const hasImage = !!imageFile || !!isExistingImage || !!tempImageKey;

  const validateImageFile = (file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.');
      return false;
    }
    
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError('File is too large. Maximum size is 5MB.');
      return false;
    }
    
    setUploadError(null);
    return true;
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    
    setImageTouched(true);

    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (validateImageFile(file)) {
      try {
        setImageFile(file);
        
        const newTempKey = `${submissionSessionId}-${imageId}-${Date.now()}`;
        
        const fileBlob = new Blob([await file.arrayBuffer()], { type: file.type });
        
        await offlineStorage.saveTempImage(newTempKey, fileBlob);
        console.log(`Image saved with key: ${newTempKey}`);
        
        setTempImageKey(newTempKey);
        
        const reader = new FileReader();
        reader.onload = () => {
          setImagePreview(reader.result as string);
        };
        reader.onerror = () => {
          setUploadError('Failed to read image file');
          setImageFile(null);
          setImagePreview(null);
          setTempImageKey(undefined);
        };
        reader.readAsDataURL(file);

        // Capture outdoor environmental data when image is uploaded
        const environmentalData = {
          outdoor_temperature: currentConditions?.temp,
          outdoor_humidity: currentConditions?.RelativeHumidity || currentConditions?.humidity
        };

        // Call the onChange callback with the new data
        onChange({ 
          file, 
          tempImageKey: newTempKey,
          isDirty: true,
          ...environmentalData
        });
        
      } catch (error) {
        console.error('Error storing image:', error);
        setUploadError('Failed to store image for offline use');
        setImageFile(null);
        setTempImageKey(undefined);
      }
    }

    e.target.value = '';
  };
  
  // Load temp image if available
  useEffect(() => {
    const loadTempImage = async () => {
      if (tempImageKey && !imageFile && !imagePreview) {
        try {
          console.log(`Loading temp image with key: ${tempImageKey}`);
          const blob = await offlineStorage.getTempImage(tempImageKey);
          
          if (blob) {
            const file = new File([blob], `image-${imageId}.jpg`, { type: blob.type });
            setImageFile(file);
            
            const url = URL.createObjectURL(blob);
            setImagePreview(url);
            
            console.log(`Successfully loaded temp image for key: ${tempImageKey}`);
            
            return () => {
              URL.revokeObjectURL(url);
            };
          } else {
            console.log(`No temp image found for key: ${tempImageKey}`);
          }
        } catch (error) {
          console.error(`Error loading temp image for key ${tempImageKey}:`, error);
        }
      }
    };
    
    loadTempImage();
  }, [tempImageKey, imageFile, imagePreview, imageId]);

  const triggerFileInput = () => {
    if (disabled) return;
    setImageTouched(true);
    fileInputRef.current?.click();
  };
  
  const handleClearImage = (e: React.MouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    setImageFile(null);
    setImagePreview(null);
    setTempImageKey(undefined);
    setImageTouched(true);
    
    if (tempImageKey) {
      try {
        offlineStorage.deleteTempImage(tempImageKey);
      } catch (error) {
        console.error('Error deleting temp image:', error);
      }
    }
    
    onChange({
      file: null,
      imageUrl: undefined,
      tempImageKey: undefined,
      isDirty: true
    });
    
    if (onClear) {
      onClear();
    }
  };
  
  // Update showClearButton based on image state
  useEffect(() => {
    setShowClearButton(!!imageFile || !!imagePreview || !!tempImageKey);
  }, [imageFile, imagePreview, tempImageKey]);
  
  // Set imageTouched true for existing images
  useEffect(() => {
    if (initialImageUrl) {
      setImageTouched(true);
    }
  }, [initialImageUrl]);

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div 
        onClick={disabled ? undefined : triggerFileInput}
        className={`
          relative flex flex-col items-center justify-center w-full h-28
          border-2 ${hasImage ? 'border-primary-300 ring-2 ring-primary-100' : 'border-dashed'} rounded-lg
          ${!disabled ? 'cursor-pointer' : 'cursor-not-allowed'}
          transition-colors
          ${imageFile || imagePreview
            ? 'border-primary-300 bg-primary-50'
            : imageTouched && !imageFile && !imagePreview && !tempImageKey
              ? 'border-error-300 bg-error-50'
              : 'border-gray-300 hover:bg-gray-100'}
          ${disabled ? 'opacity-60' : ''}
          overflow-hidden
        `}
        style={{
          backgroundImage: imagePreview ? `url(${imagePreview})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
        data-testid={testId}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleImageChange}
          disabled={disabled}
          data-testid={`${testId}-input`}
        />
        
        {/* Show upload UI only if no image */}
        {!imagePreview && (
          <div className="flex flex-col items-center justify-center p-2">
            {uploadError ? (
              <div className="flex items-center text-error-600">
                <AlertCircle size={16} className="mr-1" />
                <span className="font-medium text-sm">Image required</span>
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 text-gray-400" />
                <p className="text-xs text-gray-500 mt-1">
                  Click to upload
                </p>
              </>
            )}
          </div>
        )}
        
        {/* Show green checkmark overlay when image is present */}
        {imagePreview && (
          <div className="absolute inset-0 bg-black bg-opacity-10 flex items-center justify-center">
            <div className="bg-white bg-opacity-80 rounded-full p-1">
              <Check size={16} className="text-primary-600" />
            </div>
          </div>
        )}
        
        {/* Clear button */}
        {showClearButton && !disabled && (
          <button
            type="button"
            onClick={handleClearImage}
            className="absolute top-2 right-2 p-1 bg-white bg-opacity-80 rounded-full text-gray-500 hover:text-error-600 transition-colors"
            title="Clear image"
            data-testid={`${testId}-clear`}
          >
            <XCircle size={18} />
          </button>
        )}
      </div>
      {(imageTouched && !imageFile && !imagePreview && !tempImageKey) || uploadError ? (
        <p className="mt-1 text-sm text-error-600">{uploadError || 'Image is required'}</p>
      ) : (
        <p className="text-xs text-gray-500 mt-1">JPEG, PNG, GIF or WebP up to 5MB</p>
      )}
    </div>
  );
};

export default ImageUploadField;