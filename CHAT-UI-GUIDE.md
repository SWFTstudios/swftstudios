# Chat Messenger UI - Quick Start Guide

## Overview

The upload page has been transformed into a chat messenger-style interface for quick note-taking, similar to iMessage or WhatsApp, but for your knowledge graph.

## Features Implemented

### 1. Chat Messenger Interface
- **Thread Sidebar**: Multiple conversation threads to organize notes by topic/project
- **Message Bubbles**: Chat-style display for notes with timestamps
- **Quick Input**: Type and send notes instantly with Enter key
- **Attachments**: Upload images, audio, video, or files via attachment button

### 2. Multiple Threads
- Create new threads with the + button
- Switch between threads
- Each thread maintains its own message history
- Thread message counts update automatically

### 3. Auto-Tagging
- Automatic keyword extraction from your content
- Suggests 5-10 relevant tags based on common words/phrases
- Click suggested tags to select them
- Tags are added to your note automatically

### 4. Settings & Customization
- **Tag Colors**: Customize color for each tag
- **Graph Appearance**:
  - Node color
  - Link color  
  - Highlight color
  - Node size
  - Link width
  - Connection style (solid/dashed/dotted)
- Settings sync across devices via Supabase

### 5. Enhanced Blog Page
- **Sorting**: Sort by date, title, or author (ascending/descending)
- **Filtering**: Filter by tags and authors (works together)
- **Search**: Enhanced search includes author matching
- **Graph Highlighting**: Click a node to highlight connected nodes

## How to Use

### Sending a Note

1. **Open upload page** after signing in
2. **Type your message** in the input field at the bottom
3. **Add attachments** (optional):
   - Click attachment button (📎)
   - Choose image, audio, video, or file
   - Preview appears above input
4. **Review suggested tags** (appears automatically)
   - Click to select/deselect tags
5. **Press Enter** or click send button
6. Note appears in chat and gets committed to GitHub

### Managing Threads

1. **Create new thread**: Click + button in sidebar
2. **Switch threads**: Click any thread in the list
3. **View messages**: Messages load when you switch threads

### Customizing Appearance

1. **Open settings**: Click gear icon in header
2. **Tag Colors**:
   - Each tag shows with color picker
   - Click color to change
3. **Graph Settings**:
   - Adjust node/link colors
   - Change node size and link width
   - Select connection style
4. **Save**: Click "Save Changes"
5. **Reset**: Click "Reset to Defaults" to revert

### Using the Blog Page

1. **Sort notes**: Use dropdown to sort by date/title/author
2. **Filter by author**: Click author button to filter
3. **Filter by tags**: Click tag button to filter
4. **Search**: Type in search box (searches title, content, tags, author)
5. **View graph**: Click Graph button to see 3D visualization
6. **Highlight connections**: Click any node to see connected nodes

## Database Setup

Run the migration script in Supabase SQL Editor:

```sql
-- File: supabase-threads-migration.sql
```

This adds:
- `threads` table for conversation threads
- `thread_id` and `message_order` columns to notes table
- `notes-videos` storage bucket for video files
- Proper RLS policies

## Technical Details

### New Files Created

- `js/thread-manager.js` - Thread management
- `js/auto-tagger.js` - Keyword extraction
- `js/settings.js` - Settings management
- `js/graph-customizer.js` - Graph styling
- `css/settings.css` - Settings modal styles
- `supabase-threads-migration.sql` - Database migration

### Modified Files

- `upload.html` - Chat interface HTML
- `css/upload.css` - Chat interface styles
- `js/upload.js` - Chat message handling
- `blog.html` - Sort controls added
- `css/blog.css` - Sort control styles
- `js/blog.js` - Sorting, filtering, and graph integration

### Dependencies Added

- `marked.js` - Markdown parsing for message bubbles

## Keyboard Shortcuts

### Upload Page
- `Enter` - Send message
- `Shift + Enter` - New line in message
- `Esc` - Close attachment menu

### Blog Page
- `Esc` - Close modal/clear highlights

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile: Responsive design with simplified thread list

## Performance Notes

- Messages are stored locally for instant loading
- Settings sync to Supabase for cross-device support
- Graph rendering limited based on device (150 nodes mobile, 500 desktop)
- Lazy-loading for 3D graph library (only loads when needed)

## Next Steps

1. Run `supabase-threads-migration.sql` in Supabase SQL Editor
2. Test the chat interface at `/upload.html`
3. Try creating threads and sending different content types
4. Customize your tag colors and graph appearance in settings
5. View your notes on the blog page with new sorting/filtering

## Troubleshooting

**Threads not saving?**
- Run the migration script in Supabase
- Check browser console for errors

**Auto-tagging not working?**
- Type at least 20 characters for suggestions
- Tags appear above input field

**Settings not saving?**
- Check Supabase connection
- Settings fallback to localStorage if Supabase fails

**Graph not showing custom colors?**
- Refresh the page after changing settings
- Check browser console for errors

## Future Enhancements

- Thread search
- Message editing/deletion
- Rich text editor
- AI-powered tag suggestions
- Real-time collaboration
- Mobile app
