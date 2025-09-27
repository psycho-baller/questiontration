import { useState, useRef, useCallback } from 'react';

/**
 * A hook that maintains local input state completely isolated from server updates.
 * Once the user starts typing, it ignores all server updates until they submit or clear.
 */
export function useOptimisticInput(initialValue: string = "") {
  const [localValue, setLocalValue] = useState(initialValue);
  const [isLocallyModified, setIsLocallyModified] = useState(false);
  const hasUserInteracted = useRef(false);
  
  // Update local value and mark as modified
  const updateValue = useCallback((newValue: string) => {
    setLocalValue(newValue);
    if (!hasUserInteracted.current) {
      hasUserInteracted.current = true;
    }
    setIsLocallyModified(true);
  }, []);
  
  // Clear local state (after successful submission)
  const clearValue = useCallback(() => {
    setLocalValue("");
    setIsLocallyModified(false);
    hasUserInteracted.current = false;
  }, []);
  
  // Get current value - if user has modified locally, ignore server updates
  const getCurrentValue = useCallback(() => {
    return isLocallyModified ? localValue : initialValue;
  }, [isLocallyModified, localValue, initialValue]);
  
  // Reset to server value (only if user hasn't modified locally)
  const syncWithServer = useCallback((serverValue: string) => {
    if (!isLocallyModified && !hasUserInteracted.current) {
      setLocalValue(serverValue);
    }
  }, [isLocallyModified]);
  
  return {
    value: getCurrentValue(),
    updateValue,
    clearValue,
    syncWithServer,
    isLocallyModified,
    hasUserInteracted: hasUserInteracted.current
  };
}
