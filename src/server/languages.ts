import "server-only";
import { z } from "zod";

/**
 * The languages a tutor session can be held in, as two-letter codes: the ones
 * the voice agents speak. A lesson is spoken and heard in its language; what
 * is on the screens and in the Work Map stays as it was written.
 */
export const LANGUAGE_CODES = [
  "en", "de", "fr", "es", "it", "pt", "nl", "pl", "sv", "da", "no", "fi", "cs", "sk", "hu", "ro",
  "bg", "el", "hr", "uk", "ru", "tr", "ar", "hi", "ta", "id", "ms", "vi", "ja", "ko", "zh",
] as const;

export type Language = { code: string; name: string; own_name: string };

const inEnglish = new Intl.DisplayNames(["en"], { type: "language" });

export const isLanguage = (code: string) => (LANGUAGE_CODES as readonly string[]).includes(code);

/** A language's English name, for the agents' prompts: "German" for "de". An unknown code is given back as it is. */
export const languageName = (code: string) => inEnglish.of(code) ?? code;

/** Every language on offer, with its English name and its name in itself, as a person choosing would look for it. */
export function listLanguages(): Language[] {
  return LANGUAGE_CODES.map((code) => ({
    code,
    name: languageName(code),
    own_name: new Intl.DisplayNames([code], { type: "language" }).of(code) ?? languageName(code),
  }));
}

export const languageSchema = z
  .string("Choose a language.")
  .trim()
  .toLowerCase()
  .refine(isLanguage, "Tiro cannot hold a session in that language.");
