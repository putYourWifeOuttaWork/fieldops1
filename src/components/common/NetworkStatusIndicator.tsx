import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Cloud, CloudOff } from 'lucide-react';

interface NetworkStatusIndicatorProps {
  className?: string;
  showFullText?: boolean;
}

const NetworkStatusIndicator: React.FC<NetworkStatusIndicatorProps> = ({ 
  className = '', 
  showFullText = false 
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [showIndicator, setShowIndicator] = useState(false);

  // Check if the device is online
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // When we come online, show the indicator for 3 seconds
      setShowIndicator(true);
      setTimeout(() => setShowIndicator(false), 3000);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setShowIndicator(true); // Always show when offline
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // If we're offline initially, show the indicator
    if (!navigator.onLine) {
      setShowIndicator(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Ping the Supabase API every 30 seconds to check connection
  useEffect(() => {
    let intervalId: number;

    const checkApiConnection = async () => {
      try {
        // Simple HEAD request to Supabase to check connection
        const response = await fetch('https://vxxsqkbkkkksmhnihlkd.supabase.co/rest/v1/', {
          method: 'HEAD',
          headers: {
            'Content-Type': 'application/json',
            'ApiKey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4eHNxa2Jra2trc21obmlobGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg2NDYxMjgsImV4cCI6MjA2NDIyMjEyOH0.oGekj3JGCVloz9NVeYdKITRt-k-bWDG2zfxG75oRboQ'
          },
          // Short timeout to detect slow connections
          signal: AbortSignal.timeout(5000)
        });

        setApiConnected(response.ok);
        
        // Show the indicator briefly when API status changes
        setShowIndicator(true);
        setTimeout(() => {
          if (isOnline) { // Only hide if we're online
            setShowIndicator(false);
          }
        }, 3000);
      } catch (error) {
        setApiConnected(false);
        // Always show the indicator when API is disconnected
        setShowIndicator(true);
      }
    };

    // Check immediately and then every 30 seconds
    checkApiConnection();
    intervalId = window.setInterval(checkApiConnection, 30000);

    return () => window.clearInterval(intervalId);
  }, [isOnline]);

  // Don't render if we're online and not showing the indicator
  if (isOnline && !showIndicator) {
    return null;
  }

  let bgColor = 'bg-gray-100';
  let textColor = 'text-gray-700';
  let icon = <Wifi className="h-4 w-4 mr-2" />;
  let text = 'Connecting...';

  if (!isOnline) {
    bgColor = 'bg-error-100';
    textColor = 'text-error-700';
    icon = <WifiOff className="h-4 w-4 mr-2" />;
    text = showFullText ? 'You are offline. Changes will be saved locally.' : 'Offline';
  } else if (apiConnected === true) {
    bgColor = 'bg-success-100';
    textColor = 'text-success-700';
    icon = <Cloud className="h-4 w-4 mr-2" />;
    text = showFullText ? 'Connected to server' : 'Online';
  } else if (apiConnected === false) {
    bgColor = 'bg-warning-100';
    textColor = 'text-warning-700';
    icon = <CloudOff className="h-4 w-4 mr-2" />;
    text = showFullText ? 'Server connection issues. Changes may be saved locally.' : 'Poor Connection';
  }

  return (
    <div className={`fixed bottom-4 left-4 ${bgColor} ${textColor} px-4 py-2 rounded-full shadow-md flex items-center z-50 animate-fade-in ${className}`}>
      {icon}
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
};

export default NetworkStatusIndicator;