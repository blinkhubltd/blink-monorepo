/**
 * Validation utility functions
 */

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (basic validation)
 */
export function isValidPhone(phone: string): boolean {
  // Remove all non-digits
  const digitsOnly = phone.replace(/\D/g, '');
  // Check if it's between 10-15 digits (international formats)
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate name (first or last)
 */
export function isValidName(name: string): boolean {
  // Allow letters, spaces, hyphens, and apostrophes
  const nameRegex = /^[a-zA-Z\s'-]+$/;
  return name.length >= 2 && nameRegex.test(name);
}

/**
 * Validate form data
 */
export interface FormValidation {
  [key: string]: {
    value: any;
    required?: boolean;
    validator?: (value: any) => boolean;
    errorMessage?: string;
  };
}

export function validateForm(form: FormValidation): {
  isValid: boolean;
  errors: { [key: string]: string };
} {
  const errors: { [key: string]: string } = {};
  
  for (const [field, config] of Object.entries(form)) {
    if (config.required && !config.value) {
      errors[field] = config.errorMessage || `${field} is required`;
      continue;
    }
    
    if (config.validator && config.value && !config.validator(config.value)) {
      errors[field] = config.errorMessage || `${field} is invalid`;
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Sanitize input by trimming and removing extra spaces
 */
export function sanitizeInput(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/**
 * Validate credit card number (Luhn algorithm)
 */
export function isValidCreditCard(cardNumber: string): boolean {
  const digitsOnly = cardNumber.replace(/\D/g, '');
  
  if (digitsOnly.length < 13 || digitsOnly.length > 19) {
    return false;
  }
  
  let sum = 0;
  let isEven = false;
  
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = parseInt(digitsOnly[i], 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

/**
 * Validate CVV
 */
export function isValidCVV(cvv: string): boolean {
  const digitsOnly = cvv.replace(/\D/g, '');
  return digitsOnly.length === 3 || digitsOnly.length === 4;
}

/**
 * Validate expiry date (MM/YY format)
 */
export function isValidExpiryDate(expiry: string): boolean {
  const match = expiry.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  
  if (!match) return false;
  
  const month = parseInt(match[1], 10);
  const year = parseInt('20' + match[2], 10);
  
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  
  return true;
}

/**
 * Validate postal/zip code
 */
export function isValidPostalCode(postalCode: string, country: string = 'US'): boolean {
  const patterns: { [key: string]: RegExp } = {
    US: /^\d{5}(-\d{4})?$/,
    CA: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
    UK: /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i,
    DEFAULT: /^[\w\s-]{3,10}$/,
  };
  
  const pattern = patterns[country] || patterns.DEFAULT;
  return pattern.test(postalCode);
}

/**
 * Validate URL
 */
export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if string contains only numbers
 */
export function isNumeric(str: string): boolean {
  return /^\d+$/.test(str);
}

/**
 * Check if string contains only letters
 */
export function isAlpha(str: string): boolean {
  return /^[a-zA-Z]+$/.test(str);
}

/**
 * Check if string contains only alphanumeric characters
 */
export function isAlphanumeric(str: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(str);
}
