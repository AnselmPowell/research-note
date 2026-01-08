# Research Assistant Authentication System

## Overview

The Research Assistant uses a sophisticated multi-provider authentication system built on **Neon Auth** with custom **Microsoft OAuth integration** and **Microsoft user mapping** for seamless data access. The system supports anonymous users with automatic data migration when they sign up.

## Architecture Components

### Core Authentication Stack
- **Neon Auth**: Primary authentication backend with PostgreSQL integration
- **Custom Microsoft OAuth**: Popup-based OAuth flow with user mapping
- **Anonymous Support**: Full app functionality without account creation
- **Data Migration**: Seamless transition from anonymous to authenticated users
- **Multi-Environment**: Development, staging, and production deployment support

### Database Integration
- **User Data Storage**: Papers, notes, and folders linked to user IDs
- **Microsoft User Mappings**: Links Microsoft IDs to Neon user accounts
- **Anonymous Data**: localStorage with automatic migration capability

---

## Microsoft Authentication Flow

### User Mapping System

The Microsoft authentication system uses a **mapping table** to link Microsoft user IDs with Neon Auth user accounts. This ensures data persistence and seamless access.

#### Database Schema

```sql
CREATE TABLE microsoft_user_mappings (
  id SERIAL PRIMARY KEY,
  microsoft_id TEXT UNIQUE NOT NULL,        -- Microsoft Graph user ID
  neon_user_id TEXT NOT NULL,              -- Neon Auth user ID
  email TEXT NOT NULL,                     -- User email for verification
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Authentication Flow

1. **Microsoft OAuth**: User authenticates with Microsoft via popup
2. **Mapping Check**: System checks `microsoft_user_mappings` for existing user
3. **Existing User**: If mapping exists, user is signed in with existing Neon account
4. **New User**: If no mapping, system creates new Neon user and mapping
5. **Legacy User**: If Neon account exists but no mapping, password reset flow guides user

### Implementation Details

#### Microsoft OAuth Popup Flow

```typescript
// 1. Generate Microsoft OAuth URL with PKCE
const { authUrl, codeVerifier } = await generateMicrosoftAuthUrl();

// 2. Open popup window
const popup = window.open(authUrl, 'microsoft-auth', 'width=600,height=700');

// 3. Handle callback with authorization code
const code = extractCodeFromCallback();

// 4. Exchange code for Microsoft user information
const microsoftUser = await exchangeCodeForUserInfo(code, codeVerifier);

// 5. Check/create user mapping and sign in
const result = await createNeonUserFromMicrosoft(microsoftUser);
```

#### User Mapping Logic

```typescript
async function createNeonUserFromMicrosoft(microsoftUser: MicrosoftUser) {
  // Check for existing mapping
  const mapping = await dbService.getMicrosoftMapping(microsoftUser.id);
  
  if (mapping) {
    // Existing user - sign in with mapped Neon account
    return signInWithMappedUser(mapping.neon_user_id);
  }
  
  // Check if Neon account exists (legacy user)
  const neonUserExists = await checkNeonUserExists(microsoftUser.email);
  
  if (neonUserExists) {
    // Guide user through password reset to create mapping
    return initiatePasswordResetFlow(microsoftUser);
  }
  
  // New user - create Neon account and mapping
  return createNewUserWithMapping(microsoftUser);
}
```

---

## Environment Configuration

### Multi-Tier Environment System

The application uses a 3-tier environment variable system for deployment flexibility:

```typescript
function getEnvVar(key: string): string {
  // 1. Railway production - server-side process.env
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key];
  }
  
  // 2. Runtime injection - client-side window.ENV
  if (typeof window !== 'undefined' && window.ENV?.[key]) {
    return window.ENV[key];
  }
  
  // 3. Build-time fallback - development
  return import.meta.env[key] || '';
}
```

### Required Environment Variables

#### Server-Side (Never exposed to client)
```bash
# Sensitive API keys - stay in server environment
GEMINI_API_KEY=your_gemini_api_key_here
```

#### Client-Side (Safe for browser)
```bash
# Neon Auth configuration
VITE_NEON_AUTH_URL=https://your-auth-url.neonauth.region.aws.neon.build/neondb/auth

# Microsoft OAuth configuration
VITE_MICROSOFT_CLIENT_ID=your_microsoft_app_id
VITE_MICROSOFT_TENANT_ID=common

# Database connection
VITE_DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

---

## Database Schema

### Core Tables

#### Users (Managed by Neon Auth)
```sql
-- Neon Auth manages user table in neon_auth schema
-- Contains: id, email, name, email_verified, created_at, updated_at
```

#### Application Data Tables
```sql
-- Papers table
CREATE TABLE papers (
  uri TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  abstract TEXT,
  authors JSONB,
  num_pages INTEGER,
  is_explicitly_saved BOOLEAN DEFAULT FALSE,
  user_id TEXT,                                    -- Links to Neon Auth user
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notes table
CREATE TABLE notes (
  id SERIAL PRIMARY KEY,
  paper_uri TEXT REFERENCES papers(uri) ON DELETE CASCADE,
  content TEXT NOT NULL,
  justification TEXT,
  citations JSONB,
  related_question TEXT,
  page_number INTEGER,
  relevance_score FLOAT,
  is_starred BOOLEAN DEFAULT FALSE,
  is_flagged BOOLEAN DEFAULT FALSE,
  user_id TEXT,                                    -- Links to Neon Auth user
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Folders table
CREATE TABLE folders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  description TEXT,
  user_id TEXT,                                    -- Links to Neon Auth user
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Microsoft user mappings
CREATE TABLE microsoft_user_mappings (
  id SERIAL PRIMARY KEY,
  microsoft_id TEXT UNIQUE NOT NULL,
  neon_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## Data Migration System

### Anonymous User Support

Users can use the full application without creating an account. All data is stored in localStorage and automatically migrated when they sign up.

#### localStorage Schema

```typescript
interface LocalStorageData {
  papers: Paper[];          // Stored in 'anonymous_papers'
  notes: Note[];            // Stored in 'anonymous_notes'
  folders: Folder[];        // Stored in 'anonymous_folders'
}
```

#### Migration Process

```typescript
// Triggered on sign up or sign in
async function migrateAnonymousDataToUser(userId: string) {
  const localData = localStorageService.getAllLibraryData();
  
  // Migrate papers
  for (const paper of localData.papers) {
    await dbService.savePaper(paper, paper.is_explicitly_saved, userId);
  }
  
  // Migrate notes
  for (const note of localData.notes) {
    await dbService.saveNote(note, userId);
  }
  
  // Migrate folders
  for (const folder of localData.folders) {
    await dbService.createFolder(folder.name, folder.type, folder.parent_id, folder.description, userId);
  }
  
  // Clear localStorage after successful migration
  localStorageService.clearAllData();
}
```

### Dual Storage System

The `DatabaseContext` automatically routes operations to the appropriate storage:

```typescript
const savePaper = async (paper: any) => {
  if (user && isAuthenticated) {
    // Authenticated: Save to database
    await dbService.savePaper(paper, true, user.id);
  } else {
    // Anonymous: Save to localStorage
    localStorageService.savePaper(paper);
  }
  await refreshData();
};
```

---

## Authentication Context

### AuthContext Integration

```typescript
const AuthContext = createContext<{
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Core authentication methods
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: (resetCallbacks?: (() => void)[]) => Promise<void>;
  
  // Social authentication
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  
  // Utility methods
  clearError: () => void;
}>();
```

### Microsoft Authentication Integration

```typescript
const signInWithMicrosoft = useCallback(async () => {
  try {
    // Use custom Microsoft authentication with mapping
    const result = await customMicrosoftSignIn();
    
    if (result.success) {
      setUser(result.user);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    setError(error.message);
    throw error;
  }
}, []);
```

### Password Reset to Mapping Flow

For existing Microsoft users without mappings:

```typescript
const signIn = useCallback(async (email: string, password: string) => {
  const result = await authClient.signIn.email({ email, password });
  
  if (result.data?.user) {
    // Check for pending Microsoft mapping
    const pendingMapping = localStorage.getItem('pending_microsoft_mapping');
    
    if (pendingMapping) {
      const { microsoftId, email } = JSON.parse(pendingMapping);
      
      if (email === result.data.user.email) {
        // Create mapping for future Microsoft authentications
        await dbService.createMicrosoftMapping(
          microsoftId, 
          result.data.user.id, 
          email
        );
        localStorage.removeItem('pending_microsoft_mapping');
      }
    }
    
    setUser(result.data.user);
  }
}, []);
```

---

## Deployment Configuration

### Docker Multi-Stage Build

```dockerfile
# Stage 1: Build application
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production server
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
COPY inject-env.sh /inject-env.sh
RUN chmod +x /inject-env.sh
EXPOSE 80
CMD ["/inject-env.sh"]
```

### Runtime Environment Injection

```bash
#!/bin/sh
# inject-env.sh - Creates client environment at container startup

cat > /usr/share/nginx/html/env-config.js << EOF
window.ENV = {
  VITE_NEON_AUTH_URL: "${VITE_NEON_AUTH_URL}",
  VITE_MICROSOFT_CLIENT_ID: "${VITE_MICROSOFT_CLIENT_ID}",
  VITE_MICROSOFT_TENANT_ID: "${VITE_MICROSOFT_TENANT_ID}",
  VITE_DATABASE_URL: "${VITE_DATABASE_URL}",
  NODE_ENV: "production"
};
EOF

# Start nginx
nginx -g 'daemon off;'
```

### HTML Runtime Loading

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Research Assistant</title>
</head>
<body>
  <!-- Load runtime environment before app -->
  <script src="/env-config.js"></script>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

---

## Security Considerations

### Authentication Security
- **OAuth 2.0 + PKCE**: Prevents authorization code interception
- **JWT Sessions**: Managed by Neon Auth with automatic refresh
- **Secure Headers**: CORS, CSP, and security headers via nginx
- **Environment Separation**: API keys never exposed to client

### Data Security
- **User Isolation**: All database queries filtered by user ID
- **SQL Injection Prevention**: Parameterized queries via Neon SDK
- **XSS Protection**: React's built-in escaping + CSP headers
- **Transport Security**: HTTPS everywhere via Railway/nginx

### Microsoft OAuth Security
- **PKCE Flow**: Prevents code injection attacks
- **State Validation**: Prevents CSRF attacks
- **Secure Popup**: Cross-origin communication via postMessage
- **Token Handling**: Access tokens never stored, only used for user info

---

## Troubleshooting

### Common Issues

#### "Microsoft authentication failed"
- Check `VITE_MICROSOFT_CLIENT_ID` is set correctly
- Verify redirect URI is registered in Azure AD: `https://yourdomain.com/auth/microsoft/callback.html`
- Ensure popup blocker is disabled

#### "Account found! Password reset email sent"
- This is normal for existing users without Microsoft mapping
- Check email and reset password
- Sign in once with email/password to create mapping
- Future Microsoft authentications will work seamlessly

#### "Failed to initialize authentication"
- Check `VITE_NEON_AUTH_URL` is accessible
- Verify network connectivity to Neon Auth service
- Check browser console for detailed error messages

### Development Setup

1. **Environment Variables**: Copy `.env.example` to `.env.local`
2. **Dependencies**: Run `npm install`
3. **Database**: Ensure Neon database is accessible
4. **Microsoft App**: Register application in Azure AD
5. **Development Server**: Run `npm run dev`

### Production Deployment

1. **Railway Setup**: Connect GitHub repository
2. **Environment Variables**: Configure in Railway dashboard
3. **Domain Configuration**: Set up custom domain with HTTPS
4. **Microsoft App**: Update redirect URIs for production domain
5. **Monitor Logs**: Check Railway deployment logs for issues

---

## API Reference

### Database Service Methods

```typescript
// Microsoft user mapping
await dbService.getMicrosoftMapping(microsoftId: string)
await dbService.createMicrosoftMapping(microsoftId: string, neonUserId: string, email: string)

// User data operations
await dbService.savePaper(paper: any, isExplicit: boolean, userId?: string)
await dbService.saveNote(note: DeepResearchNote, userId?: string)
await dbService.getUserPapers(userId: string)
await dbService.getUserNotes(userId: string)
await dbService.getAllLibraryData(userId?: string)
```

### Authentication Methods

```typescript
// Neon Auth integration
await authClient.signIn.email({ email, password })
await authClient.signUp.email({ email, password, name })
await authClient.signIn.social({ provider: 'google', redirectTo })
await authClient.getSession()
await authClient.signOut()
await authClient.resetPassword({ email })

// Custom Microsoft OAuth
await signInWithMicrosoftPopup()
```

---

This authentication system provides a robust, secure, and user-friendly experience while maintaining data integrity and supporting seamless migration from anonymous to authenticated usage.