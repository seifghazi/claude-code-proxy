import { useState } from 'react';
import { Image as ImageIcon, Download, Maximize2, X } from 'lucide-react';

interface ImageContentProps {
  content: {
    source?: {
      type: string;
      media_type: string;
      data: string;
    };
    data?: string;
    media_type?: string;
  };
}

export function ImageContent({ content }: ImageContentProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Extract image data and media type
  let imageData: string | undefined;
  let mediaType: string | undefined;

  if (content.source) {
    // Claude API format
    imageData = content.source.data;
    mediaType = content.source.media_type;
  } else if (content.data) {
    // Alternative format
    imageData = content.data;
    mediaType = content.media_type || 'image/png';
  }

  if (!imageData) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <ImageIcon className="w-4 h-4 text-amber-600" />
          <span className="text-amber-700 font-medium text-sm">No image data available</span>
        </div>
      </div>
    );
  }

  // Ensure the data URI is properly formatted
  const dataUri = imageData.startsWith('data:') 
    ? imageData 
    : `data:${mediaType || 'image/png'};base64,${imageData}`;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = `image-${Date.now()}.${mediaType?.split('/')[1] || 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (imageError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <ImageIcon className="w-4 h-4 text-red-600" />
          <span className="text-red-700 font-medium text-sm">Failed to load image</span>
        </div>
        <details className="mt-2 cursor-pointer">
          <summary className="text-xs text-red-600 hover:text-red-800 underline transition-colors">
            Show raw data
          </summary>
          <pre className="mt-2 text-xs overflow-x-auto bg-white rounded p-3 border border-red-200 font-mono">
            {JSON.stringify(content, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <ImageIcon className="w-4 h-4 text-blue-600" />
            <span className="text-gray-700 font-medium text-sm">
              Image ({mediaType || 'unknown type'})
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownload}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
              title="Download image"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsFullscreen(true)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
              title="View fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="bg-white rounded border border-gray-200 p-2">
          <img
            src={dataUri}
            alt="Content image"
            className="max-w-full h-auto rounded cursor-pointer"
            onClick={() => setIsFullscreen(true)}
            onError={() => setImageError(true)}
          />
        </div>
      </div>

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen(false);
              }}
              className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300 transition-colors"
              title="Close"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={dataUri}
              alt="Content image (fullscreen)"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
}