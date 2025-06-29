import React from 'react';

interface CodeDiffProps {
  oldCode: string;
  newCode: string;
  fileName?: string;
}

export function CodeDiff({ oldCode, newCode, fileName }: CodeDiffProps) {
  // Split code into lines
  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');
  
  // Simple diff algorithm - find common prefix and suffix
  let start = 0;
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  
  // Find common prefix
  while (start <= oldEnd && start <= newEnd && oldLines[start] === newLines[start]) {
    start++;
  }
  
  // Find common suffix
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }
  
  // Build diff display
  const diffLines: Array<{ type: 'unchanged' | 'removed' | 'added'; content: string; lineNum?: number }> = [];
  
  // Add unchanged prefix
  for (let i = 0; i < start; i++) {
    diffLines.push({ type: 'unchanged', content: oldLines[i], lineNum: i + 1 });
  }
  
  // Add removed lines
  for (let i = start; i <= oldEnd; i++) {
    diffLines.push({ type: 'removed', content: oldLines[i] });
  }
  
  // Add added lines
  for (let i = start; i <= newEnd; i++) {
    diffLines.push({ type: 'added', content: newLines[i], lineNum: i + 1 });
  }
  
  // Add unchanged suffix
  for (let i = oldEnd + 1; i < oldLines.length; i++) {
    diffLines.push({ type: 'unchanged', content: oldLines[i], lineNum: i + 1 + (newEnd - oldEnd) });
  }
  
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
      {fileName && (
        <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 text-sm text-gray-300">
          {fileName}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <tbody>
            {diffLines.map((line, idx) => (
              <tr
                key={idx}
                className={
                  line.type === 'removed' ? 'bg-red-900/20' :
                  line.type === 'added' ? 'bg-green-900/20' :
                  ''
                }
              >
                <td className="px-2 py-0.5 text-right text-gray-500 select-none w-12">
                  {line.type === 'removed' ? '-' : line.lineNum || ''}
                </td>
                <td className="px-2 py-0.5 text-right text-gray-500 select-none w-12">
                  {line.type === 'added' ? '+' : line.type === 'unchanged' ? line.lineNum || '' : ''}
                </td>
                <td className="px-1 py-0.5 select-none w-6 text-center">
                  <span className={
                    line.type === 'removed' ? 'text-red-400' :
                    line.type === 'added' ? 'text-green-400' :
                    'text-gray-600'
                  }>
                    {line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' '}
                  </span>
                </td>
                <td className="px-2 py-0.5 whitespace-pre overflow-x-auto">
                  <span className={
                    line.type === 'removed' ? 'text-red-300' :
                    line.type === 'added' ? 'text-green-300' :
                    'text-gray-300'
                  }>
                    {line.content}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}