import { z } from 'zod';

/** Mirrors backend `PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_LENGTH` (backend/app/schemas/auth.py). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address');

/** A NEW password chosen by the user. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

/** An EXISTING password being entered (login / current password): only presence is checked. */
export const existingPasswordSchema = z
  .string()
  .min(1, 'Password is required')
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const fullNameSchema = z.string().trim().max(255, 'Name must be at most 255 characters');

/** Field name used for "passwords do not match" errors in confirm-password forms. */
export const PASSWORD_MISMATCH_MESSAGE = 'Passwords do not match';
