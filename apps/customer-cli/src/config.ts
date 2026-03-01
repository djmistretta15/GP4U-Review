/**
 * CLI Config Store
 *
 * Persists auth token, API URL, and preferences to:
 *   ~/.config/gp4u/config.json (Linux/Mac)
 *   %APPDATA%\gp4u\Config\config.json (Windows)
 *
 * Uses the 'conf' package which handles platform-appropriate paths,
 * file permissions (600), and atomic writes.
 */

import Conf from 'conf'

interface GP4UConfig {
  api_url:    string
  token:      string | null
  subject_id: string | null
  email:      string | null
}

const store = new Conf<GP4UConfig>({
  projectName: 'gp4u',
  defaults: {
    api_url:    'https://gp4u.com',
    token:      null,
    subject_id: null,
    email:      null,
  },
  // Restrict file permissions to owner-read-write only
  configFileMode: 0o600,
})

export const config = {
  get apiUrl():    string         { return store.get('api_url') },
  get token():     string | null  { return store.get('token')   },
  get subjectId(): string | null  { return store.get('subject_id') },
  get email():     string | null  { return store.get('email') },

  setAuth(token: string, subject_id: string, email: string) {
    store.set('token',      token)
    store.set('subject_id', subject_id)
    store.set('email',      email)
  },

  setApiUrl(url: string) {
    store.set('api_url', url.replace(/\/$/, ''))
  },

  logout() {
    store.set('token',      null)
    store.set('subject_id', null)
    store.set('email',      null)
  },

  isLoggedIn(): boolean {
    return !!store.get('token')
  },
}
