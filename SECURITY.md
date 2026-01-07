# Security Guide - Research Notes Application

## 🔒 Security Architecture

This document outlines the security measures implemented in the Research Notes application.

## Authentication Security

### 1. Multi-Provider OAuth
- **Neon Auth**: Primary authentication backend with enterprise-grade security
- **Google OAuth**: Industry-standard OAuth 2.0 implementation
- **Microsoft OAuth**: Custom PKCE-enabled popup flow for enhanced security

### 2. Password Security
- **Deterministic Generation**: Microsoft users get auto-generated secure passwords
- **10,000 Hash Rounds**: PBKDF2-like key derivation for maximum security
- **Encrypted Storage**: All passwords encrypted before localStorage storage
- **AES-GCM Encryption**: Browser-native cryptographic APIs

### 3. Session Management
- **JWT Tokens**: Handled entirely by Neon Auth backend
- **Secure Storage**: No sensitive tokens in localStorage
- **Automatic Expiry**: Sessions expire according to security best practices

## Environment Security

### 1. Multi-Tier Variable Access
```
PRIORITY 1: Railway production (process.env) - Server-side API keys
PRIORITY 2: Runtime injection (window.ENV) - Client-safe variables
PRIORITY 3: Build-time fallback (Vite) - Development only
```

### 2. API Key Protection
- ✅ **Server-side keys**: Never exposed to client browsers
- ✅ **Client-safe variables**: Only `VITE_*` prefixed variables in browser
- ✅ **Runtime injection**: Environment variables injected at container startup

### 3. Secure Build Process
```dockerfile
# Stage 1: Build without environment variables
# Stage 2: Runtime injection via secure script
```

## Transport Security

### 1. HTTPS Enforcement
- **Railway Platform**: Automatic HTTPS termination
- **HSTS Headers**: `Strict-Transport-Security` with 1-year max-age
- **Secure Cookies**: All authentication cookies marked secure

### 2. Content Security Policy
```nginx
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' 'sha256-HASH' trusted-cdns;
  connect-src 'self' auth-providers api-endpoints;
  object-src 'none';
  base-uri 'self';
```

## Data Protection

### 1. Local Storage Encryption
- **User passwords**: AES-GCM encrypted with browser-specific keys
- **Research data**: Anonymous users get localStorage, authenticated users get database
- **Migration security**: Automatic data transfer on user authentication

### 2. Database Security
- **Neon PostgreSQL**: Enterprise-grade database with TLS encryption
- **User isolation**: All data scoped to authenticated user IDs
- **SQL injection prevention**: Parameterized queries throughout

## Network Security

### 1. CORS Protection
- **Origin restrictions**: Only trusted domains allowed
- **Credential controls**: Strict cookie handling
- **Preflight verification**: Complex requests properly validated

### 2. XSS Prevention
- **Content filtering**: All user input sanitized
- **CSP enforcement**: Inline scripts blocked
- **Output encoding**: HTML entities properly escaped

## OAuth Security (Microsoft)

### 1. PKCE Implementation
```typescript
// Code challenge generation
const codeVerifier = generateCodeVerifier();
const codeChallenge = await generateCodeChallenge(codeVerifier);

// Server verifies: SHA256(verifier) === challenge
```

### 2. Popup Security
- **Cross-origin protection**: Popup domain isolation
- **State verification**: CSRF protection with cryptographic state
- **Timeout handling**: 5-minute maximum authentication window

## Security Headers

### Implemented Headers
```nginx
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

## Development vs Production

### Development Security
- **Local environment**: All variables accessible for debugging
- **Console logging**: Detailed but non-sensitive information
- **Hot reload**: Environment changes require restart

### Production Security
- **Minimal logging**: No sensitive information in logs
- **Runtime injection**: Environment variables loaded at container startup
- **Error handling**: Generic error messages to prevent information disclosure

## Security Best Practices

### For Developers
1. **Never log sensitive data** in production
2. **Use `VITE_` prefix** for client-safe variables only
3. **Test authentication flows** thoroughly before deployment
4. **Monitor security headers** in browser developer tools

### For Deployment
1. **Verify environment variables** are set correctly in Railway
2. **Test OAuth redirects** with production URLs
3. **Monitor application logs** for security events
4. **Regular security audits** of dependencies

## Incident Response

### Security Issue Reporting
1. **Identify the issue**: Document the potential vulnerability
2. **Assess impact**: Determine affected users and data
3. **Implement fix**: Deploy security patch immediately
4. **Monitor**: Watch for any exploitation attempts

### Emergency Procedures
1. **Disable authentication** if compromise suspected
2. **Rotate all API keys** in Railway dashboard
3. **Force user logout** by restarting the application
4. **Review access logs** for unauthorized access

## Regular Security Tasks

### Weekly
- [ ] Review application logs for suspicious activity
- [ ] Check dependency updates for security patches
- [ ] Monitor authentication success/failure rates

### Monthly
- [ ] Audit user permissions and access patterns
- [ ] Review and update security headers
- [ ] Test backup and recovery procedures

### Quarterly
- [ ] Full security audit of codebase
- [ ] Penetration testing of authentication flows
- [ ] Update security documentation

---

**Last Updated**: January 2026  
**Security Contact**: Application Administrator  
**Threat Model**: Web application with OAuth authentication and sensitive user data
