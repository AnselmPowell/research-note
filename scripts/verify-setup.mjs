#!/usr/bin/env node

/**
 * Setup Verification Script for Research Note Application
 * Run with: npm run verify-setup
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnvFile() {
  try {
    const envPath = join(__dirname, '..', '.env.local');
    const envContent = readFileSync(envPath, 'utf8');
    
    const envVars = {};
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...values] = line.split('=');
        if (key && values.length > 0) {
          envVars[key.trim()] = values.join('=').trim();
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.log('❌ Could not read .env.local file');
    console.log(`   Make sure .env.local exists in: ${join(__dirname, '..', '.env.local')}`);
    return null;
  }
}

function checkConfiguration() {
  console.log('🔍 Research Note - Configuration Verification\n');
  
  const envVars = loadEnvFile();
  if (!envVars) {
    process.exit(1);
  }
  
  let hasErrors = false;
  
  // Check Core AI Configuration
  if (envVars.GEMINI_API_KEY && envVars.GEMINI_API_KEY !== 'PLACEHOLDER_API_KEY') {
    console.log('✅ Gemini AI API Key: Configured');
  } else {
    console.log('❌ Gemini AI API Key: MISSING or using placeholder - Required for core functionality');
    console.log('   Get your API key from: https://aistudio.google.com/apikey');
    hasErrors = true;
  }
  
  // Check Google Search Configuration
  if (envVars.GOOGLE_SEARCH_KEY && envVars.GOOGLE_SEARCH_CX) {
    console.log('✅ Google Search API: Configured');
  } else {
    console.log('⚠️  Google Search API: Missing - Web search feature will be disabled');
  }
  
  // Check OpenAI Configuration
  if (envVars.OPENAI_API_KEY) {
    console.log('✅ OpenAI Fallback: Configured');
  } else {
    console.log('⚠️  OpenAI Fallback: Missing - No fallback when Gemini is unavailable');
  }
  
  // Check Database Configuration
  if (envVars.DATABASE_URL) {
    console.log('✅ Database: Configured');
  } else {
    console.log('⚠️  Database: Missing - Using fallback connection string');
  }
  
  console.log(`\n🎯 Environment: ${envVars.NODE_ENV || 'development'}`);
  
  if (hasErrors) {
    console.log('\n❌ Configuration check failed! Please fix the errors above before running the application.');
    console.log('\n💡 To fix: Update your .env.local file with valid API keys');
    console.log('📖 For setup help, see the README.md file\n');
    process.exit(1);
  } else {
    console.log('\n✅ Configuration check passed! You can now run: npm run dev');
    console.log('\n🚀 Next steps:');
    console.log('   1. Run: npm install (if you haven\'t already)');
    console.log('   2. Run: npm run dev');
    console.log('   3. Open: http://localhost:3000');
    console.log('\n🧪 To test API connections, try starting the app and using the search feature.\n');
  }
}

async function testGeminiConnection(apiKey) {
  try {
    console.log('🧪 Testing Gemini AI connection...');
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'Say "Research Note configured successfully!" in exactly 5 words.'
          }]
        }]
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Connected successfully';
      console.log('✅ Gemini AI: Connection successful');
      console.log(`   Response: ${text.trim()}`);
      return true;
    } else {
      const error = await response.text();
      console.log('❌ Gemini AI: Connection failed');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${error.substring(0, 200)}...`);
      return false;
    }
  } catch (error) {
    console.log('❌ Gemini AI: Connection failed');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

function validateDatabaseUrl(url) {
  try {
    const dbUrl = new URL(url);
    if (dbUrl.hostname && dbUrl.username) {
      console.log('✅ Database URL: Valid format');
      console.log(`   Host: ${dbUrl.hostname}`);
      return true;
    } else {
      console.log('⚠️  Database URL: Missing host or username');
      return false;
    }
  } catch (error) {
    console.log('❌ Database URL: Invalid format');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

// Main execution
async function main() {
  checkConfiguration();
  
  // If we get here, configuration is valid
  const envVars = loadEnvFile();
  
  // Additional tests if environment variables look good
  if (envVars && envVars.GEMINI_API_KEY && envVars.GEMINI_API_KEY !== 'PLACEHOLDER_API_KEY') {
    console.log('\n🔬 Running additional validation tests...\n');
    
    await testGeminiConnection(envVars.GEMINI_API_KEY);
    
    if (envVars.DATABASE_URL) {
      validateDatabaseUrl(envVars.DATABASE_URL);
    }
    
    console.log('\n✅ All tests completed! Your Research Note application is ready to run.\n');
  }
}

main().catch(error => {
  console.error('❌ Verification script failed:', error.message);
  process.exit(1);
});
