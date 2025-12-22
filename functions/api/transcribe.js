/**
 * Cloudflare Worker function for transcribing audio files
 * Uses OpenAI's Whisper model via Hugging Face Inference API
 * 
 * Setup:
 * 1. Get free API key from https://huggingface.co/settings/tokens
 * 2. Add HUGGINGFACE_API_KEY to Cloudflare environment variables
 * 3. Deploy this function to Cloudflare Workers/Pages Functions
 * 
 * Alternative options:
 * - Replicate: Set REPLICATE_API_TOKEN (pay-as-you-go)
 * - OpenAI API: Set OPENAI_API_KEY (if Whisper API is available)
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    // Get audio URL from request body
    const body = await request.json();
    const { audioUrl } = body;

    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'audioUrl is required' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Fetch audio file - ensure we get the complete file
    console.log(`[Whisper] Fetching audio from: ${audioUrl}`);
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`);
    }
    
    // Get content length to verify we're getting the full file
    const contentLength = audioResponse.headers.get('content-length');
    if (contentLength) {
      console.log(`[Whisper] Audio file size: ${contentLength} bytes`);
    }
    
    const audioBlob = await audioResponse.blob();
    const audioArrayBuffer = await audioResponse.arrayBuffer();
    
    console.log(`[Whisper] Audio loaded: ${audioArrayBuffer.byteLength} bytes, type: ${audioBlob.type}`);

    // Try Hugging Face first (free tier with Whisper)
    if (env.HUGGINGFACE_API_KEY) {
      try {
        return await transcribeWithHuggingFace(audioArrayBuffer, env.HUGGINGFACE_API_KEY);
      } catch (error) {
        console.error('Hugging Face transcription failed:', error);
        // Fall through to next option
      }
    }

    // Try Replicate (pay-as-you-go)
    if (env.REPLICATE_API_TOKEN) {
      try {
        return await transcribeWithReplicate(audioUrl, env.REPLICATE_API_TOKEN);
      } catch (error) {
        console.error('Replicate transcription failed:', error);
        // Fall through to next option
      }
    }

    // Try OpenAI Whisper API (if available)
    if (env.OPENAI_API_KEY) {
      try {
        return await transcribeWithOpenAI(audioBlob, env.OPENAI_API_KEY);
      } catch (error) {
        console.error('OpenAI transcription failed:', error);
      }
    }

    // No API keys configured
    return new Response(
      JSON.stringify({ 
        error: 'No transcription API configured. Please set HUGGINGFACE_API_KEY, REPLICATE_API_TOKEN, or OPENAI_API_KEY in environment variables.' 
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Transcription failed',
        details: error.stack 
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Transcribe using Hugging Face Inference API with OpenAI Whisper model
 * Free tier available - uses openai/whisper-large-v3
 * 
 * Note: Hugging Face returns the full transcript. We ensure we capture it completely.
 */
async function transcribeWithHuggingFace(audioArrayBuffer, apiKey) {
  // Hugging Face API accepts raw audio bytes
  // We can request return_timestamps to get segments
  const response = await fetch(
    'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/octet-stream',
      },
      body: audioArrayBuffer,
    }
  );

  if (!response.ok) {
    // If model is loading (503), wait and retry
    if (response.status === 503) {
      const retryAfter = response.headers.get('Retry-After') || '30';
      const waitTime = parseInt(retryAfter) * 1000;
      console.log(`[Whisper] Model loading, waiting ${retryAfter} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Retry once
      const retryResponse = await fetch(
        'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/octet-stream',
          },
          body: audioArrayBuffer,
        }
      );
      
      if (!retryResponse.ok) {
        const errorText = await retryResponse.text();
        console.error('[Whisper] Hugging Face retry failed:', errorText);
        throw new Error(`Hugging Face API error: ${errorText}`);
      }
      
      const result = await retryResponse.json();
      const transcript = extractFullTranscript(result);
      const segments = extractSegments(result);
      
      console.log(`[Whisper] Transcription complete. Length: ${transcript.length} characters`);
      
      return new Response(
        JSON.stringify({
          transcript: transcript,
          segments: segments,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    const errorText = await response.text();
    console.error('[Whisper] Hugging Face API error:', errorText);
    throw new Error(`Hugging Face API error: ${errorText}`);
  }

  const result = await response.json();
  
  // Extract full transcript - handle various response formats
  const transcript = extractFullTranscript(result);
  const segments = extractSegments(result);
  
  console.log(`[Whisper] Transcription complete. Length: ${transcript.length} characters, Segments: ${segments?.length || 0}`);
  
  if (!transcript || transcript.trim().length === 0) {
    console.warn('[Whisper] Warning: Empty transcript received');
    throw new Error('Received empty transcript from Whisper API');
  }
  
  return new Response(
    JSON.stringify({
      transcript: transcript,
      segments: segments,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Extract full transcript from Hugging Face response
 * Handles various response formats
 */
function extractFullTranscript(result) {
  // Handle array format: [{text: "...", chunks: [...]}]
  if (Array.isArray(result)) {
    if (result.length > 0) {
      // If it's an array of objects with text property
      if (result[0]?.text) {
        return result[0].text;
      }
      // If it's an array of strings
      if (typeof result[0] === 'string') {
        return result.join(' ');
      }
    }
    return '';
  }
  
  // Handle object format: {text: "...", chunks: [...]}
  if (result.text) {
    return result.text;
  }
  
  // Handle chunks format: {chunks: [{text: "...", timestamp: {...}}]}
  if (result.chunks && Array.isArray(result.chunks)) {
    return result.chunks.map(chunk => chunk.text || '').join(' ').trim();
  }
  
  // Fallback: try to stringify if it's a simple value
  if (typeof result === 'string') {
    return result;
  }
  
  console.warn('[Whisper] Unexpected response format:', JSON.stringify(result).substring(0, 200));
  return '';
}

/**
 * Extract segments with timestamps from Hugging Face response
 */
function extractSegments(result) {
  // Hugging Face may return chunks with timestamps
  if (result.chunks && Array.isArray(result.chunks)) {
    return result.chunks.map((chunk, index) => ({
      text: chunk.text || '',
      start: chunk.timestamp?.[0] || chunk.start || (index * 5), // Fallback to estimated time
      end: chunk.timestamp?.[1] || chunk.end || ((index + 1) * 5),
    })).filter(seg => seg.text && seg.text.trim());
  }
  
  // If result is an array with chunk data
  if (Array.isArray(result) && result[0]?.chunks) {
    return extractSegments(result[0]);
  }
  
  return null;
}

/**
 * Transcribe using Replicate Whisper model
 * Pay-as-you-go pricing
 */
async function transcribeWithReplicate(audioUrl, apiToken) {
  // Start transcription job
  const startResponse = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: '30414ee7c4fffc37e260fcab7842b5be470b9b840f2b608f5baa9bbef9a259ed', // whisper-large-v3
      input: {
        audio: audioUrl,
        language: 'en',
        translate: false,
      },
    }),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    throw new Error(`Replicate API error: ${errorText}`);
  }

  const { id } = await startResponse.json();

  // Poll for result
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        'Authorization': `Token ${apiToken}`,
      },
    });

    if (!statusResponse.ok) {
      throw new Error(`Failed to check prediction status: ${statusResponse.statusText}`);
    }

    const statusData = await statusResponse.json();

    if (statusData.status === 'succeeded') {
      // Replicate returns full transcript - ensure we capture it all
      const transcript = statusData.output?.text || statusData.output || '';
      const segments = statusData.output?.segments || statusData.output?.chunks || null;
      
      console.log(`[Whisper] Replicate transcription complete. Length: ${transcript.length} characters, Segments: ${segments?.length || 0}`);
      
      if (!transcript || transcript.trim().length === 0) {
        console.warn('[Whisper] Warning: Empty transcript from Replicate');
        throw new Error('Received empty transcript from Replicate');
      }
      
      return new Response(
        JSON.stringify({
          transcript: transcript,
          segments: segments,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } else if (statusData.status === 'failed') {
      throw new Error(`Transcription failed: ${statusData.error || 'Unknown error'}`);
    }

    attempts++;
  }

  throw new Error('Transcription timed out');
}

/**
 * Transcribe using OpenAI Whisper API
 * Requires OpenAI API key with Whisper access
 */
async function transcribeWithOpenAI(audioBlob, apiKey) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');
  formData.append('response_format', 'verbose_json'); // Get segments

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${errorText}`);
  }

  const result = await response.json();
  
  // OpenAI Whisper returns full transcript in result.text
  const transcript = result.text || '';
  const segments = result.segments?.map(seg => ({
    text: seg.text || '',
    start: seg.start || 0,
    end: seg.end || 0,
  })).filter(seg => seg.text && seg.text.trim()) || null;
  
  console.log(`[Whisper] OpenAI transcription complete. Length: ${transcript.length} characters, Segments: ${segments?.length || 0}`);
  
  if (!transcript || transcript.trim().length === 0) {
    console.warn('[Whisper] Warning: Empty transcript from OpenAI');
    throw new Error('Received empty transcript from OpenAI Whisper API');
  }
  
  return new Response(
    JSON.stringify({
      transcript: transcript,
      segments: segments,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
