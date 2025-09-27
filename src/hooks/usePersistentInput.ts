import { useCallback, useEffect, useRef } from 'react';
import useSessionStorage from './useSessionStorage';

/**
 * A hook that persists input text across component re-renders and unmounts.
 * Specifically designed to handle the case where other users' actions cause
 * component re-renders that would normally reset local state.
 */
export function usePersistentInput(
  storageKey: string,
  shouldClear?: boolean
): [string, (value: string) => void] {
  const [value, setValue] = useSessionStorage<string>(storageKey, "");
  const hasBeenCleared = useRef(false);
  
  // Clear the input when shouldClear becomes true (e.g., after user submits)
  useEffect(() => {
    if (shouldClear && !hasBeenCleared.current) {
      console.log("Clearing persistent input for key:", storageKey);
      hasBeenCleared.current = true;
      setValue("");
    } else if (!shouldClear) {
      // Reset the flag when shouldClear becomes false (new round/session)
      hasBeenCleared.current = false;
    }
  }, [shouldClear, setValue, storageKey]);
  
  const setValueWithLogging = useCallback((newValue: string) => {
    console.log("Setting persistent input value:", newValue, "for key:", storageKey);
    setValue(newValue);
  }, [setValue, storageKey]);
  
  return [value, setValueWithLogging];
}
