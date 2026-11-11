export const LANGS = { en: { name: 'English', wps: 2.5, rtl: false }, ur: { name: 'Urdu', wps: 2.3, rtl: true } }
export const narrationRules = cfg => cfg.language === 'ur' ? 'Write natural, SPOKEN Urdu in Urdu (Arabic) script - never Roman Urdu. Use simple everyday words, keep familiar technical terms in English letters, use Urdu punctuation (۔ and ؟), and prefer short sentences.' : 'Write clear, natural spoken English. End every sentence with . ! or ?'
export const screenRules = cfg => cfg.screen_language === 'ur' ? 'All on-screen text must be short, simple Urdu in Urdu script. English technical terms may be their own short labels; never mix scripts in one label.' : 'All text shown on screen must be short, clear English.'
export const END_PUNCT = /[.!?۔؟…]\s*$/
