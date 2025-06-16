import { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

const NetworkStatusIndicator = () => {
  const isOnline = useOnlineStatus();
  const [isVisible, setIsVisible] = useState(false);
  
  // Show the indicator when status changes
  useEffect(() => {
    setIsVisible(true);
    
    // Hide after 3 seconds if online
    if (isOnline) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [isOnline]);
  
  if (!isVisible && isOnline) return null;
  
  return (
    <div 
      className={`fixed bottom-4 left-4 z-50 px-3 py-2 rounded-full text-sm font-medium shadow-md transition-all duration-300 ${
        isOnline 
          ? 'bg-success-100 text-success-800 border border-success-200' 
          : 'bg-warning-100 text-warning-800 border border-warning-200'
      }`}
      data-testid="network-status-indicator"
    >
      <div className="flex items-center space-x-2">
        {isOnline ? (
          <>
            <Wifi size={16} />
            <span>Online</span>
          </>
        ) : (
          <>
            <WifiOff size={16} />
            <span>Offline</span>
          </>
        )}
      </div>
    </div>
  );
};

export default NetworkStatusIndicator;