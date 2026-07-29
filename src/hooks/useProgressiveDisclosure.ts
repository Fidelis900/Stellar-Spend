import { useState, useEffect } from 'react';

const STORAGE_KEY = 'stellar-spend-advanced-options';

export function useProgressiveDisclosure(key: string, defaultOpen = false) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const stored = localStorage.getItem(`${STORAGE_KEY}:${key}`);
    if (stored !== null) {
      setIsOpen(stored === 'true');
    }
  }, [key]);

  const toggle = () => {
    setIsOpen((prev) => {
      const newValue = !prev;
      localStorage.setItem(`${STORAGE_KEY}:${key}`, String(newValue));
      return newValue;
    });
  };

  return {
    isOpen,
    toggle,
    isMounted,
  };
}
