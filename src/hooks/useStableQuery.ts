import { useRef } from 'react';
import { useSessionQuery } from './useServerSession';

/**
 * A version of useSessionQuery that's less reactive - it keeps showing stale data
 * while fresh data is loading, instead of showing undefined and causing flickers.
 * This prevents input fields from losing focus during real-time updates.
 */
export const useStableQuery = ((name, ...args) => {
  const result = useSessionQuery(name, ...args);
  
  // useRef() creates an object that doesn't change between re-renders
  // stored.current will be result (undefined) on the first render
  const stored = useRef(result);
  
  // After the first render, stored.current only changes if we change it
  // if result is undefined, fresh data is loading and we should do nothing
  if (result !== undefined) {
    // if a freshly loaded result is available, use the ref to store it
    stored.current = result;
  }
  
  // undefined on first load, stale data while reloading, fresh data after loading
  return stored.current;
}) as typeof useSessionQuery; // make sure we match the useSessionQuery signature & return type
