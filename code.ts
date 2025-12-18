// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.

interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Preset {
  id: string;
  name: string;
  padding: Padding;
  spacing: number;
  layout: 'horizontal' | 'vertical' | 'maintain';
  alignment: 'top' | 'center' | 'bottom' | 'left' | 'right';
}

interface ApplyMessage {
  type: 'apply';
  mode: 'create' | 'update';
  padding: Padding;
  spacing: number;
  layout: 'horizontal' | 'vertical' | 'maintain';
  alignment: 'top' | 'center' | 'bottom' | 'left' | 'right';
}

interface CancelMessage {
  type: 'cancel';
}

interface SavePresetMessage {
  type: 'save-preset';
  name: string;
  padding: Padding;
  spacing: number;
  layout: 'horizontal' | 'vertical' | 'maintain';
  alignment: 'top' | 'center' | 'bottom' | 'left' | 'right';
}

interface LoadPresetMessage {
  type: 'load-preset';
  presetId: string;
}

interface DeletePresetMessage {
  type: 'delete-preset';
  presetId: string;
}

interface UpdatePresetMessage {
  type: 'update-preset';
  presetId: string;
  padding: Padding;
  spacing: number;
  layout: 'horizontal' | 'vertical' | 'maintain';
  alignment: 'top' | 'center' | 'bottom' | 'left' | 'right';
}

interface ListPresetsMessage {
  type: 'list-presets';
}

type PluginMessage = ApplyMessage | CancelMessage | SavePresetMessage | LoadPresetMessage | DeletePresetMessage | ListPresetsMessage | UpdatePresetMessage;

// Store original selection to restore after operations
let originalSelectionToRestore: SceneNode[] | null = null;

// Preset storage key
const PRESETS_STORAGE_KEY = 'autosection-presets';

// Preset management functions
async function getPresets(): Promise<Preset[]> {
  try {
    const stored = await figma.clientStorage.getAsync(PRESETS_STORAGE_KEY);
    return stored || [];
  } catch (e) {
    console.warn('Error loading presets:', e);
    return [];
  }
}

async function savePreset(preset: Preset): Promise<void> {
  try {
    const presets = await getPresets();
    const existingIndex = presets.findIndex(p => p.id === preset.id);
    
    if (existingIndex >= 0) {
      presets[existingIndex] = preset;
    } else {
      presets.push(preset);
    }
    
    await figma.clientStorage.setAsync(PRESETS_STORAGE_KEY, presets);
  } catch (e) {
    console.warn('Error saving preset:', e);
    throw e;
  }
}

async function deletePreset(presetId: string): Promise<void> {
  try {
    const presets = await getPresets();
    const filtered = presets.filter(p => p.id !== presetId);
    await figma.clientStorage.setAsync(PRESETS_STORAGE_KEY, filtered);
  } catch (e) {
    console.warn('Error deleting preset:', e);
    throw e;
  }
}

async function getPreset(presetId: string): Promise<Preset | null> {
  try {
    const presets = await getPresets();
    return presets.find(p => p.id === presetId) || null;
  } catch (e) {
    console.warn('Error getting preset:', e);
    return null;
  }
}

// Helper type for nodes that have position and size properties
type PositionedNode = SceneNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Helper function to check if a node has position and size properties
function hasPositionAndSize(node: SceneNode): node is PositionedNode {
  return (
    typeof (node as any).x === 'number' &&
    typeof (node as any).y === 'number' &&
    typeof (node as any).width === 'number' &&
    typeof (node as any).height === 'number'
  );
}

// Handle plugin commands
figma.on('run', ({ command }) => {
  if (command === 'create-section') {
    figma.showUI(__html__, { width: 300, height: 520 });
    handleCreateSection();
  } else if (command === 'update-section') {
    figma.showUI(__html__, { width: 300, height: 520 });
    handleUpdateSection();
  } else if (command === 'refresh-section') {
    // Don't show UI for refresh - update directly
    handleRefreshSection();
  } else if (command === 'update-all-sections') {
    // Don't show UI - update all sections directly
    handleUpdateAllSections();
  }
});

function detectSpacing(frames: PositionedNode[]): number | null {
  if (frames.length < 2) {
    return null;
  }
  
  // Sort frames by position (top to bottom, left to right)
  const sortedFrames = [...frames].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 10) {
      // Same row, sort by X
      return a.x - b.x;
    }
    return a.y - b.y;
  });
  
  // Group frames by approximate row (within 10px)
  const rows: PositionedNode[][] = [];
  let currentRow: PositionedNode[] = [];
  let currentRowY = sortedFrames[0]?.y ?? 0;
  
  for (const frame of sortedFrames) {
    if (Math.abs(frame.y - currentRowY) < 10) {
      currentRow.push(frame);
    } else {
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
      currentRow = [frame];
      currentRowY = frame.y;
    }
  }
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }
  
  // Check horizontal spacing in rows
  const horizontalSpacings: number[] = [];
  for (const row of rows) {
    if (row.length < 2) continue;
    row.sort((a, b) => a.x - b.x);
    for (let i = 0; i < row.length - 1; i++) {
      const spacing = row[i + 1].x - (row[i].x + row[i].width);
      if (spacing >= 0) {
        horizontalSpacings.push(spacing);
      }
    }
  }
  
  // Check vertical spacing between rows
  const verticalSpacings: number[] = [];
  if (rows.length > 1) {
    for (let i = 0; i < rows.length - 1; i++) {
      const currentRow = rows[i];
      const nextRow = rows[i + 1];
      const currentRowBottom = Math.max(...currentRow.map(f => f.y + f.height));
      const nextRowTop = Math.min(...nextRow.map(f => f.y));
      const spacing = nextRowTop - currentRowBottom;
      if (spacing >= 0) {
        verticalSpacings.push(spacing);
      }
    }
  }
  
  // Combine all spacings
  const allSpacings = [...horizontalSpacings, ...verticalSpacings];
  if (allSpacings.length === 0) {
    return null;
  }
  
  // Check if all spacings are approximately the same (within 2px tolerance for better detection)
  const firstSpacing = allSpacings[0];
  const tolerance = 2; // Increased tolerance to handle floating point precision issues
  const isEven = allSpacings.every(s => Math.abs(s - firstSpacing) <= tolerance);
  
  // Return the spacing if all are the same (including 0)
  if (isEven && firstSpacing >= 0) {
    return Math.round(firstSpacing);
  }
  
  // If not all even, try to find the most common spacing (within 2px tolerance)
  // Group spacings by rounded value
  const spacingGroups: { [key: number]: number[] } = {};
  for (const spacing of allSpacings) {
    const rounded = Math.round(spacing);
    if (!spacingGroups[rounded]) {
      spacingGroups[rounded] = [];
    }
    spacingGroups[rounded].push(spacing);
  }
  
  // Find the most common spacing group
  let maxCount = 0;
  let mostCommonSpacing: number | null = null;
  for (const roundedStr in spacingGroups) {
    const rounded = parseInt(roundedStr);
    const group = spacingGroups[rounded];
    if (group.length > maxCount) {
      maxCount = group.length;
      mostCommonSpacing = rounded;
    }
  }
  
  // If the most common spacing appears in at least 20% of cases, use it
  // Lowered threshold from 50% to handle cases with many different spacing values
  // Also prioritize non-zero spacings if they appear frequently enough
  if (mostCommonSpacing !== null && maxCount >= allSpacings.length * 0.2) {
    // If the most common is 0, but there's a non-zero spacing that appears multiple times, prefer that
    // This handles cases where 0 spacing is common but there's a meaningful spacing value
    if (mostCommonSpacing === 0 && maxCount < allSpacings.length * 0.5) {
      let bestNonZeroSpacing: number | null = null;
      let bestNonZeroCount = 0;
      for (const roundedStr in spacingGroups) {
        const rounded = parseInt(roundedStr);
        if (rounded > 0) {
          const group = spacingGroups[rounded];
          // Prefer non-zero spacing if it appears at least 2 times and is at least 5% of total
          if (group.length > bestNonZeroCount && group.length >= 2 && group.length >= allSpacings.length * 0.05) {
            bestNonZeroCount = group.length;
            bestNonZeroSpacing = rounded;
          }
        }
      }
      if (bestNonZeroSpacing !== null) {
        return bestNonZeroSpacing;
      }
    }
    return mostCommonSpacing;
  }
  
  // If no spacing meets the 20% threshold, still try to find the most common non-zero spacing
  // that appears at least 2 times
  if (mostCommonSpacing === 0 || (mostCommonSpacing !== null && maxCount < allSpacings.length * 0.2)) {
    let bestNonZeroSpacing: number | null = null;
    let bestNonZeroCount = 0;
    for (const roundedStr in spacingGroups) {
      const rounded = parseInt(roundedStr);
      if (rounded > 0 && spacingGroups[rounded].length >= 2) {
        const group = spacingGroups[rounded];
        if (group.length > bestNonZeroCount) {
          bestNonZeroCount = group.length;
          bestNonZeroSpacing = rounded;
        }
      }
    }
    if (bestNonZeroSpacing !== null) {
      return bestNonZeroSpacing;
    }
  }
  
  return null;
}

function detectLayoutAndAlignment(frames: PositionedNode[]): { layout: 'horizontal' | 'vertical' | 'maintain', alignment: 'top' | 'center' | 'bottom' | 'left' | 'right' } {
  if (frames.length < 2) {
    return { layout: 'horizontal', alignment: 'top' };
  }

  // Calculate bounding box to determine layout direction
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const frame of frames) {
    minX = Math.min(minX, frame.x);
    minY = Math.min(minY, frame.y);
    maxX = Math.max(maxX, frame.x + frame.width);
    maxY = Math.max(maxY, frame.y + frame.height);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const tolerance = 2; // 2px tolerance for alignment detection

  // Determine if layout is more horizontal or vertical
  const isHorizontal = width > height * 1.2; // More than 20% wider than tall
  const isVertical = height > width * 1.2; // More than 20% taller than wide

  if (isHorizontal) {
    // Horizontal layout - detect vertical alignment
    const topYs = frames.map(f => f.y);
    const bottomYs = frames.map(f => f.y + f.height);
    const centerYs = frames.map(f => f.y + f.height / 2);

    // Check if all tops are aligned
    const topAligned = topYs.every(y => Math.abs(y - topYs[0]) <= tolerance);
    // Check if all bottoms are aligned
    const bottomAligned = bottomYs.every(y => Math.abs(y - bottomYs[0]) <= tolerance);
    // Check if centers are aligned (within tolerance)
    const avgCenterY = centerYs.reduce((a, b) => a + b, 0) / centerYs.length;
    const centerAligned = centerYs.every(y => Math.abs(y - avgCenterY) <= tolerance);

    if (topAligned) {
      return { layout: 'horizontal', alignment: 'top' };
    } else if (bottomAligned) {
      return { layout: 'horizontal', alignment: 'bottom' };
    } else if (centerAligned) {
      return { layout: 'horizontal', alignment: 'center' };
    } else {
      // Default to top if no clear alignment
      return { layout: 'horizontal', alignment: 'top' };
    }
  } else if (isVertical) {
    // Vertical layout - detect horizontal alignment
    const leftXs = frames.map(f => f.x);
    const rightXs = frames.map(f => f.x + f.width);
    const centerXs = frames.map(f => f.x + f.width / 2);

    // Check if all lefts are aligned
    const leftAligned = leftXs.every(x => Math.abs(x - leftXs[0]) <= tolerance);
    // Check if all rights are aligned
    const rightAligned = rightXs.every(x => Math.abs(x - rightXs[0]) <= tolerance);
    // Check if centers are aligned (within tolerance)
    const avgCenterX = centerXs.reduce((a, b) => a + b, 0) / centerXs.length;
    const centerAligned = centerXs.every(x => Math.abs(x - avgCenterX) <= tolerance);

    if (leftAligned) {
      return { layout: 'vertical', alignment: 'left' };
    } else if (rightAligned) {
      return { layout: 'vertical', alignment: 'right' };
    } else if (centerAligned) {
      return { layout: 'vertical', alignment: 'center' };
    } else {
      // Default to left if no clear alignment
      return { layout: 'vertical', alignment: 'left' };
    }
  } else {
    // Maintain layout - can't determine clear direction
    return { layout: 'maintain', alignment: 'top' };
  }
}

function handleCreateSection() {
  const selection = figma.currentPage.selection;
  
  // Validate selection
  if (selection.length === 0) {
    figma.notify('Please select at least one frame');
    figma.closePlugin();
    return;
  }
  
  // Filter to only nodes that have position and size properties
  const frames = selection.filter(hasPositionAndSize);
  
  if (frames.length === 0) {
    figma.notify('Please select at least one element with position and size');
    figma.closePlugin();
    return;
  }
  
  if (frames.length !== selection.length) {
    figma.notify('Some selected items don\'t have position and size. Only valid elements will be used.');
  }
  
  // Detect spacing between frames
  const detectedSpacing = detectSpacing(frames);
  
  // Detect layout and alignment
  const { layout: detectedLayout, alignment: detectedAlignment } = detectLayoutAndAlignment(frames);
  
  // Send init message to UI
  figma.ui.postMessage({
    type: 'init',
    mode: 'create',
    detectedSpacing: detectedSpacing,
    detectedLayout: detectedLayout,
    detectedAlignment: detectedAlignment
  });
  
  // Load presets and send to UI
  loadPresetsForUI();
}

async function loadPresetsForUI() {
  try {
    const presets = await getPresets();
    figma.ui.postMessage({ type: 'presets-list', presets });
  } catch (e) {
    console.warn('Error loading presets for UI:', e);
  }
}

function handleUpdateSection() {
  const selection = figma.currentPage.selection;
  
  // Validate selection
  if (selection.length !== 1) {
    figma.notify('Please select exactly one element');
    figma.closePlugin();
    return;
  }
  
  const selectedNode = selection[0];
  originalSelectionToRestore = [selectedNode]; // Store original selection to restore later
  
  // Find section - either the selected node if it's a section, or the parent-most section
  let section: SectionNode | null = null;
  
  if (selectedNode.type === 'SECTION') {
    section = selectedNode as SectionNode;
  } else {
    // Find parent-most section
    section = findParentSection(selectedNode);
    if (!section) {
      figma.notify('Selected element is not inside a Section');
      figma.closePlugin();
      return;
    }
  }
  
  // Set selection to section temporarily so updateSection can find it
  figma.currentPage.selection = [section];
  
  // Find all frames inside the section
  const frames = findFramesInSection(section);
  
  if (frames.length === 0) {
    figma.notify('No elements with position and size found inside the selected section');
    figma.closePlugin();
    return;
  }
  
  // Check if section has stored settings (from previous create/update)
  // Settings are retrieved from this specific section node (per-section storage)
  const storedSettingsData = section.getPluginData('autosection-settings');
  
  let spacingValue: number | null = null;
  let roundedPadding: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
  let detectedLayout: 'horizontal' | 'vertical' | 'maintain' = 'horizontal';
  let detectedAlignment: 'top' | 'center' | 'bottom' | 'left' | 'right' = 'top';
  let useStoredSettings = false;
  
  if (storedSettingsData && storedSettingsData !== '') {
    // Use stored settings instead of detecting from current state
    try {
      const storedSettings = JSON.parse(storedSettingsData);
      spacingValue = storedSettings.spacing !== null && storedSettings.spacing !== undefined ? storedSettings.spacing : null;
      roundedPadding = storedSettings.padding;
      detectedLayout = storedSettings.layout;
      detectedAlignment = storedSettings.alignment;
      useStoredSettings = true;
    } catch (e) {
      console.warn('Update - Error parsing stored settings, falling back to detection:', e);
      // Parse failed, will use detection logic below
      useStoredSettings = false;
    }
  }
  
  // If no stored settings or parsing failed, detect from current state
  if (!useStoredSettings) {
    // Detect spacing between frames (convert to absolute positions first)
    // When frames are children of a section, their x/y are relative to the section
    const sectionX = section.x;
    const sectionY = section.y;
    
    // Create temporary objects with absolute positions for spacing detection
    // We need to convert relative positions (frame.x, frame.y) to absolute positions
    // This matches the approach used in createSection where frames are already in absolute coordinates
    const absoluteFrames = frames.map(frame => {
      const absX = sectionX + frame.x;
      const absY = sectionY + frame.y;
      return {
        x: absX,
        y: absY,
        width: frame.width,
        height: frame.height
      } as PositionedNode;
    });
    
    
    // Use the same detectSpacing function as createSection
    const detectedSpacing = detectSpacing(absoluteFrames);
    
    // Detect layout and alignment
    const layoutAndAlignment = detectLayoutAndAlignment(absoluteFrames);
    detectedLayout = layoutAndAlignment.layout;
    detectedAlignment = layoutAndAlignment.alignment;
    
    
    // Calculate current padding from section
    // Find the minimum positions of frames relative to section
    // When frames are children of a section, frame.x and frame.y are relative to the section origin
    let minFrameX = Infinity;
    let minFrameY = Infinity;
    let maxFrameX = -Infinity;
    let maxFrameY = -Infinity;
    
    for (const frame of frames) {
      // frame.x and frame.y are already relative to section when frame is a child of section
      minFrameX = Math.min(minFrameX, frame.x);
      minFrameY = Math.min(minFrameY, frame.y);
      maxFrameX = Math.max(maxFrameX, frame.x + frame.width);
      maxFrameY = Math.max(maxFrameY, frame.y + frame.height);
    }
    
    // Calculate padding (distance from section edges to frame bounds)
    // If frames have negative positions, they extend beyond the section's origin
    // In that case, padding should be calculated from the actual content bounds
    // Clamp negative values to 0 for padding calculation
    const currentPadding = {
      top: Math.max(0, minFrameY),
      right: Math.max(0, section.width - maxFrameX),
      bottom: Math.max(0, section.height - maxFrameY),
      left: Math.max(0, minFrameX)
    };
    
    
    // Ensure detectedSpacing is a number or null (not undefined)
    spacingValue = detectedSpacing !== null && detectedSpacing !== undefined ? detectedSpacing : null;
    
    // Round padding values to avoid floating point precision issues
    roundedPadding = {
      top: Math.round(currentPadding.top),
      right: Math.round(currentPadding.right),
      bottom: Math.round(currentPadding.bottom),
      left: Math.round(currentPadding.left)
    };
  }
  
  // Send init message to UI
  figma.ui.postMessage({
    type: 'init',
    mode: 'update',
    detectedSpacing: spacingValue,
    currentPadding: roundedPadding,
    detectedLayout: detectedLayout,
    detectedAlignment: detectedAlignment
  });
  
  
  // Load presets and send to UI
  loadPresetsForUI();
}

function findFramesInSection(section: SectionNode): PositionedNode[] {
  const frames: PositionedNode[] = [];
  
  // Only get direct children of the section, not nested children
  for (const child of section.children) {
    if (hasPositionAndSize(child)) {
      frames.push(child);
    }
  }
  
  return frames;
}

// Helper function to find the parent-most section from a node
function findParentSection(node: SceneNode): SectionNode | null {
  let current: BaseNode | null = node;
  
  while (current) {
    if (current.type === 'SECTION') {
      return current as SectionNode;
    }
    // Move to parent, but stop if parent is a PageNode (not a SceneNode)
    const parent = current.parent;
    if (!parent || parent.type === 'PAGE') {
      break;
    }
    // parent is a SceneNode at this point
    current = parent as SceneNode;
  }
  
  return null;
}

// Helper function to find all sections on the current page that have stored settings
function findAllSectionsWithSettings(): Array<{section: SectionNode, settings: any}> {
  const sectionsWithSettings: Array<{section: SectionNode, settings: any}> = [];
  
  // Recursively find all sections on the page
  function findSections(node: SceneNode) {
    if (node.type === 'SECTION') {
      const section = node as SectionNode;
      const storedSettingsData = section.getPluginData('autosection-settings');
      
      if (storedSettingsData && storedSettingsData !== '') {
        try {
          const settings = JSON.parse(storedSettingsData);
          sectionsWithSettings.push({ section, settings });
        } catch (e) {
          console.warn('Error parsing settings for section:', section.name, e);
        }
      }
    }
    
    // Recursively check children
    if ('children' in node) {
      for (const child of node.children) {
        findSections(child);
      }
    }
  }
  
  // Start from the current page's children
  for (const child of figma.currentPage.children) {
    findSections(child);
  }
  
  return sectionsWithSettings;
}

// Helper function to update a single section using its stored settings
function updateSectionWithStoredSettings(section: SectionNode, storedSettings: any): boolean {
  const frames = findFramesInSection(section);
  
  if (frames.length === 0) {
    return false;
  }
  
  // Create ApplyMessage from stored settings
  const msg: ApplyMessage = {
    type: 'apply',
    mode: 'update',
    padding: storedSettings.padding,
    spacing: storedSettings.spacing,
    layout: storedSettings.layout,
    alignment: storedSettings.alignment
  };
  
  // Store section position and frame relative positions before removing from section
  const originalSectionX = section.x;
  const originalSectionY = section.y;
  
  // Store relative positions (frame.x and frame.y are relative to section while they're children)
  const initialFramePositions = frames.map(frame => ({
    frame,
    relativeX: frame.x,
    relativeY: frame.y
  }));
  
  // Remove frames from section to work with absolute coordinates
  const parent = section.parent;
  if (!parent) {
    return false;
  }
  
  for (const frame of frames) {
    parent.appendChild(frame);
  }
  
  // Convert to absolute positions (frames are no longer children of section)
  for (const {frame, relativeX, relativeY} of initialFramePositions) {
    try {
      frame.x = originalSectionX + relativeX;
      frame.y = originalSectionY + relativeY;
    } catch (e) {
      console.warn('Could not set position for frame:', frame.name, e);
    }
  }
  
  // Calculate bounding box of all frames
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const frame of frames) {
    minX = Math.min(minX, frame.x);
    minY = Math.min(minY, frame.y);
    maxX = Math.max(maxX, frame.x + frame.width);
    maxY = Math.max(maxY, frame.y + frame.height);
  }
  
  // Arrange frames based on layout
  if (msg.layout === 'horizontal') {
    arrangeFramesHorizontal(frames, msg.spacing, minX, minY, msg.alignment as 'top' | 'center' | 'bottom');
  } else if (msg.layout === 'vertical') {
    arrangeFramesVertical(frames, msg.spacing, minX, minY, msg.alignment as 'left' | 'center' | 'right');
  } else {
    arrangeFramesMaintain(frames, msg.spacing);
  }
  
  // Calculate new bounding box after arrangement
  let newMinX = Infinity;
  let newMinY = Infinity;
  let newMaxX = -Infinity;
  let newMaxY = -Infinity;
  
  for (const frame of frames) {
    newMinX = Math.min(newMinX, frame.x);
    newMinY = Math.min(newMinY, frame.y);
    newMaxX = Math.max(newMaxX, frame.x + frame.width);
    newMaxY = Math.max(newMaxY, frame.y + frame.height);
  }
  
  // Calculate relative positions and expected size
  const sectionX = newMinX - msg.padding.left;
  const sectionY = newMinY - msg.padding.top;
  
  const frameRelativePositions: Array<{frame: PositionedNode, x: number, y: number}> = [];
  for (const frame of frames) {
    const relativeX = (frame.x - newMinX) + msg.padding.left;
    const relativeY = (frame.y - newMinY) + msg.padding.top;
    frameRelativePositions.push({frame, x: relativeX, y: relativeY});
  }
  
  // Calculate maximum relative positions
  let maxRelativeX = 0;
  let maxRelativeY = 0;
  
  for (const {frame, x, y} of frameRelativePositions) {
    maxRelativeX = Math.max(maxRelativeX, x + frame.width);
    maxRelativeY = Math.max(maxRelativeY, y + frame.height);
  }
  
  const expectedWidth = maxRelativeX + msg.padding.right;
  const expectedHeight = maxRelativeY + msg.padding.bottom;
  
  // Update section position and size
  section.x = sectionX;
  section.y = sectionY;
  section.resizeWithoutConstraints(expectedWidth, expectedHeight);
  
  // Add frames to section
  for (const {frame, x, y} of frameRelativePositions) {
    try {
      frame.x = x;
      frame.y = y;
      section.appendChild(frame);
    } catch (e) {
      console.warn('Could not set position for frame:', frame.name, e);
    }
  }
  
  // Store settings again (in case they were updated)
  const settingsData = JSON.stringify({
    padding: msg.padding,
    spacing: msg.spacing,
    layout: msg.layout,
    alignment: msg.alignment
  });
  section.setPluginData('autosection-settings', settingsData);
  
  return true;
}

function handleUpdateAllSections() {
  // Find all sections on the page with stored settings
  const sectionsWithSettings = findAllSectionsWithSettings();
  
  if (sectionsWithSettings.length === 0) {
    figma.notify('No sections with stored settings found on this page');
    figma.closePlugin();
    return;
  }
  
  // Store original selection
  const originalSelection = [...figma.currentPage.selection];
  
  let successCount = 0;
  let failCount = 0;
  
  // Update each section
  for (const {section, settings} of sectionsWithSettings) {
    try {
      if (updateSectionWithStoredSettings(section, settings)) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (e) {
      console.warn('Error updating section:', section.name, e);
      failCount++;
    }
  }
  
  // Restore original selection
  figma.currentPage.selection = originalSelection;
  
  // Show notification
  if (failCount === 0) {
    figma.notify(`Updated ${successCount} section(s)`);
  } else {
    figma.notify(`Updated ${successCount} section(s), ${failCount} failed`);
  }
  
  figma.closePlugin();
}

function handleRefreshSection() {
  const selection = figma.currentPage.selection;
  
  // Validate selection
  if (selection.length !== 1) {
    figma.notify('Please select exactly one element');
    figma.closePlugin();
    return;
  }
  
  const selectedNode = selection[0];
  originalSelectionToRestore = [selectedNode]; // Store original selection to restore later
  
  // Find section - either the selected node if it's a section, or the parent-most section
  let section: SectionNode | null = null;
  
  if (selectedNode.type === 'SECTION') {
    section = selectedNode as SectionNode;
  } else {
    // Find parent-most section
    section = findParentSection(selectedNode);
    if (!section) {
      figma.notify('Selected element is not inside a Section');
      figma.closePlugin();
      return;
    }
  }
  
  // Set selection to section temporarily so updateSection can find it
  figma.currentPage.selection = [section];
  
  // Check if section has stored settings (only available if created/updated with this plugin)
  // Settings are retrieved from this specific section node (per-section storage)
  const storedSettingsData = section.getPluginData('autosection-settings');
  
  if (!storedSettingsData || storedSettingsData === '') {
    figma.notify('Refresh is only available for sections created or updated with AutoSection');
    figma.closePlugin();
    return;
  }
  
  // Parse stored settings
  let storedSettings: {
    padding: Padding;
    spacing: number;
    layout: 'horizontal' | 'vertical' | 'maintain';
    alignment: 'top' | 'center' | 'bottom' | 'left' | 'right';
  };
  
  try {
    storedSettings = JSON.parse(storedSettingsData);
  } catch (e) {
    figma.notify('Error reading stored settings. Please update the section first.');
    figma.closePlugin();
    return;
  }
  
  const frames = findFramesInSection(section);
  
  if (frames.length === 0) {
    figma.notify('No elements with position and size found inside the selected section');
    figma.closePlugin();
    return;
  }
  
  // Use stored settings instead of detecting from current state
  const msg: ApplyMessage = {
    type: 'apply',
    mode: 'update',
    padding: storedSettings.padding,
    spacing: storedSettings.spacing,
    layout: storedSettings.layout,
    alignment: storedSettings.alignment
  };
  
  // Set selection to section temporarily so updateSection can find it
  figma.currentPage.selection = [section];
  
  // Don't show UI, just update directly
  // updateSection will restore the original selection
  updateSection(msg);
}

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === 'cancel') {
    figma.closePlugin();
    return;
  }
  
  if (msg.type === 'apply') {
    if (msg.mode === 'create') {
      createSection(msg);
    } else {
      updateSection(msg);
    }
    return;
  }
  
  if (msg.type === 'save-preset') {
    try {
      const preset: Preset = {
        id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: msg.name,
        padding: msg.padding,
        spacing: msg.spacing,
        layout: msg.layout,
        alignment: msg.alignment
      };
      await savePreset(preset);
      figma.ui.postMessage({ type: 'preset-saved', preset });
      figma.notify(`Preset "${msg.name}" saved`);
    } catch (e) {
      figma.ui.postMessage({ type: 'preset-error', error: 'Failed to save preset' });
      figma.notify('Failed to save preset');
    }
    return;
  }
  
  if (msg.type === 'load-preset') {
    try {
      const preset = await getPreset(msg.presetId);
      if (preset) {
        figma.ui.postMessage({ type: 'preset-loaded', preset });
      } else {
        figma.ui.postMessage({ type: 'preset-error', error: 'Preset not found' });
        figma.notify('Preset not found');
      }
    } catch (e) {
      figma.ui.postMessage({ type: 'preset-error', error: 'Failed to load preset' });
      figma.notify('Failed to load preset');
    }
    return;
  }
  
  if (msg.type === 'delete-preset') {
    try {
      await deletePreset(msg.presetId);
      figma.ui.postMessage({ type: 'preset-deleted', presetId: msg.presetId });
      figma.notify('Preset deleted');
    } catch (e) {
      figma.ui.postMessage({ type: 'preset-error', error: 'Failed to delete preset' });
      figma.notify('Failed to delete preset');
    }
    return;
  }
  
  if (msg.type === 'update-preset') {
    try {
      const existingPreset = await getPreset(msg.presetId);
      if (!existingPreset) {
        figma.ui.postMessage({ type: 'preset-error', error: 'Preset not found' });
        figma.notify('Preset not found');
        return;
      }
      
      const updatedPreset: Preset = {
        ...existingPreset,
        padding: msg.padding,
        spacing: msg.spacing,
        layout: msg.layout,
        alignment: msg.alignment
      };
      await savePreset(updatedPreset);
      figma.ui.postMessage({ type: 'preset-updated', preset: updatedPreset });
      figma.notify(`Preset "${existingPreset.name}" updated`);
    } catch (e) {
      figma.ui.postMessage({ type: 'preset-error', error: 'Failed to update preset' });
      figma.notify('Failed to update preset');
    }
    return;
  }
  
  if (msg.type === 'list-presets') {
    try {
      const presets = await getPresets();
      figma.ui.postMessage({ type: 'presets-list', presets });
    } catch (e) {
      figma.ui.postMessage({ type: 'preset-error', error: 'Failed to load presets' });
    }
    return;
  }
};

function createSection(msg: ApplyMessage) {
  const selection = figma.currentPage.selection;
  const frames = selection.filter(hasPositionAndSize);
  
  if (frames.length === 0) {
    figma.notify('No elements with position and size selected');
    figma.closePlugin();
    return;
  }
  
  // Calculate bounding box of all frames
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const frame of frames) {
    minX = Math.min(minX, frame.x);
    minY = Math.min(minY, frame.y);
    maxX = Math.max(maxX, frame.x + frame.width);
    maxY = Math.max(maxY, frame.y + frame.height);
  }
  
  // Arrange frames based on layout (in absolute coordinates)
  if (msg.layout === 'horizontal') {
    arrangeFramesHorizontal(frames, msg.spacing, minX, minY, msg.alignment as 'top' | 'center' | 'bottom');
  } else if (msg.layout === 'vertical') {
    arrangeFramesVertical(frames, msg.spacing, minX, minY, msg.alignment as 'left' | 'center' | 'right');
  } else {
    // Maintain positions but add spacing
    arrangeFramesMaintain(frames, msg.spacing);
  }
  
  // Calculate new bounding box after arrangement
  let newMinX = Infinity;
  let newMinY = Infinity;
  let newMaxX = -Infinity;
  let newMaxY = -Infinity;
  
  for (const frame of frames) {
    newMinX = Math.min(newMinX, frame.x);
    newMinY = Math.min(newMinY, frame.y);
    newMaxX = Math.max(newMaxX, frame.x + frame.width);
    newMaxY = Math.max(newMaxY, frame.y + frame.height);
  }
  
  // Calculate relative positions and expected size
  const sectionX = newMinX - msg.padding.left;
  const sectionY = newMinY - msg.padding.top;
  
  const frameRelativePositions: Array<{frame: PositionedNode, x: number, y: number}> = [];
  for (const frame of frames) {
    // Position frames with padding inside the section
    // Calculate offset from the content start (newMinX, newMinY) and add padding
    const relativeX = (frame.x - newMinX) + msg.padding.left;
    const relativeY = (frame.y - newMinY) + msg.padding.top;
    frameRelativePositions.push({frame, x: relativeX, y: relativeY});
  }
  
  // Calculate maximum relative positions
  let maxRelativeX = 0;
  let maxRelativeY = 0;
  
  for (const {frame, x, y} of frameRelativePositions) {
    maxRelativeX = Math.max(maxRelativeX, x + frame.width);
    maxRelativeY = Math.max(maxRelativeY, y + frame.height);
  }
  
  const expectedWidth = maxRelativeX + msg.padding.right;
  const expectedHeight = maxRelativeY + msg.padding.bottom;
  
  // Create section - use resizeWithoutConstraints() to set the size explicitly
  // This is the key method that works with sections (inspired by wrap-in-section plugin)
  const section = figma.createSection();
  section.name = 'Section';
  section.x = sectionX;
  section.y = sectionY;
  section.resizeWithoutConstraints(expectedWidth, expectedHeight);
  
  // Add frames to section (frames are already positioned with padding)
  for (const {frame, x, y} of frameRelativePositions) {
    frame.x = x;
    frame.y = y;
    section.appendChild(frame);
  }
  
  
  // Store settings in plugin data for refresh functionality
  // Settings are stored per-section (each section has its own settings, not file-wide)
  const settingsData = JSON.stringify({
    padding: msg.padding,
    spacing: msg.spacing,
    layout: msg.layout,
    alignment: msg.alignment
  });
  section.setPluginData('autosection-settings', settingsData);
  
  // Select the section (don't zoom to preserve current view)
  figma.currentPage.selection = [section];
  
  figma.notify(`Section created with ${frames.length} frame(s)`);
  figma.closePlugin();
}

function updateSection(msg: ApplyMessage) {
  const selection = figma.currentPage.selection;
  
  if (selection.length !== 1 || selection[0].type !== 'SECTION') {
    figma.notify('Please select a Section to update');
    figma.closePlugin();
    return;
  }
  
  const section = selection[0] as SectionNode;
  const frames = findFramesInSection(section);
  
  if (frames.length === 0) {
    figma.notify('No elements with position and size found in section');
    figma.closePlugin();
    return;
  }
  
  // Store section position and frame relative positions before removing from section
  const originalSectionX = section.x;
  const originalSectionY = section.y;
  
  // Store relative positions (frame.x and frame.y are relative to section while they're children)
  const initialFramePositions = frames.map(frame => ({
    frame,
    relativeX: frame.x,
    relativeY: frame.y
  }));
  
  // Remove frames from section to work with absolute coordinates
  // This is necessary because we can't modify frame.x/y while they're children of the section
  const parent = section.parent;
  if (!parent) {
    figma.notify('Section has no parent');
    figma.closePlugin();
    return;
  }
  
  for (const frame of frames) {
    parent.appendChild(frame);
  }
  
  // Convert to absolute positions (frames are no longer children of section)
  for (const {frame, relativeX, relativeY} of initialFramePositions) {
    try {
      frame.x = originalSectionX + relativeX;
      frame.y = originalSectionY + relativeY;
    } catch (e) {
      console.warn('Could not set position for frame:', frame.name, e);
    }
  }
  
  // Calculate bounding box of all frames (same as createSection)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const frame of frames) {
    minX = Math.min(minX, frame.x);
    minY = Math.min(minY, frame.y);
    maxX = Math.max(maxX, frame.x + frame.width);
    maxY = Math.max(maxY, frame.y + frame.height);
  }
  
  // Arrange frames based on layout (in absolute coordinates) - same as createSection
  if (msg.layout === 'horizontal') {
    arrangeFramesHorizontal(frames, msg.spacing, minX, minY, msg.alignment as 'top' | 'center' | 'bottom');
  } else if (msg.layout === 'vertical') {
    arrangeFramesVertical(frames, msg.spacing, minX, minY, msg.alignment as 'left' | 'center' | 'right');
  } else {
    // Maintain positions but add spacing
    arrangeFramesMaintain(frames, msg.spacing);
  }
  
  // Calculate new bounding box after arrangement (same as createSection)
  let newMinX = Infinity;
  let newMinY = Infinity;
  let newMaxX = -Infinity;
  let newMaxY = -Infinity;
  
  for (const frame of frames) {
    newMinX = Math.min(newMinX, frame.x);
    newMinY = Math.min(newMinY, frame.y);
    newMaxX = Math.max(newMaxX, frame.x + frame.width);
    newMaxY = Math.max(newMaxY, frame.y + frame.height);
  }
  
  // Calculate relative positions and expected size (same as createSection)
  const sectionX = newMinX - msg.padding.left;
  const sectionY = newMinY - msg.padding.top;
  
  const frameRelativePositions: Array<{frame: PositionedNode, x: number, y: number}> = [];
  for (const frame of frames) {
    // Position frames with padding inside the section
    // Calculate offset from the content start (newMinX, newMinY) and add padding
    const relativeX = (frame.x - newMinX) + msg.padding.left;
    const relativeY = (frame.y - newMinY) + msg.padding.top;
    frameRelativePositions.push({frame, x: relativeX, y: relativeY});
  }
  
  // Calculate maximum relative positions (same as createSection)
  let maxRelativeX = 0;
  let maxRelativeY = 0;
  
  for (const {frame, x, y} of frameRelativePositions) {
    maxRelativeX = Math.max(maxRelativeX, x + frame.width);
    maxRelativeY = Math.max(maxRelativeY, y + frame.height);
  }
  
  const expectedWidth = maxRelativeX + msg.padding.right;
  const expectedHeight = maxRelativeY + msg.padding.bottom;
  
  // Update section position and size
  section.x = sectionX;
  section.y = sectionY;
  section.resizeWithoutConstraints(expectedWidth, expectedHeight);
  
  // Add frames to section (same as createSection)
  for (const {frame, x, y} of frameRelativePositions) {
    try {
      frame.x = x;
      frame.y = y;
      section.appendChild(frame);
    } catch (e) {
      console.warn('Could not set position for frame:', frame.name, e);
    }
  }
  
  
  // Store settings in plugin data for refresh functionality
  // Settings are stored per-section (each section has its own settings, not file-wide)
  const settingsData = JSON.stringify({
    padding: msg.padding,
    spacing: msg.spacing,
    layout: msg.layout,
    alignment: msg.alignment
  });
  section.setPluginData('autosection-settings', settingsData);
  
  // Don't change the selection to avoid triggering Figma's auto-zoom behavior
  // The section is already selected (we validated this at the start of the function)
  // so we'll leave the selection as-is to preserve the current viewport
  if (originalSelectionToRestore) {
    // Clear the stored selection but don't restore it to avoid zoom
    originalSelectionToRestore = null;
  }
  
  figma.notify(`Section updated with ${frames.length} frame(s)`);
  figma.closePlugin();
}

function arrangeFramesHorizontal(frames: PositionedNode[], spacing: number, startX: number, startY: number, alignment: 'top' | 'center' | 'bottom' = 'top') {
  let currentX = startX;
  
  // Sort frames by original X position
  const sortedFrames = [...frames].sort((a, b) => a.x - b.x);
  
  // Calculate the maximum height for alignment
  const maxHeight = Math.max(...sortedFrames.map(f => f.height));
  
  // Calculate base Y position based on alignment
  let baseY: number;
  if (alignment === 'top') {
    baseY = startY;
  } else if (alignment === 'center') {
    baseY = startY + maxHeight / 2;
  } else { // bottom
    baseY = startY + maxHeight;
  }
  
  for (const frame of sortedFrames) {
    try {
      frame.x = currentX;
      
      // Calculate Y position based on alignment
      if (alignment === 'top') {
        frame.y = baseY;
      } else if (alignment === 'center') {
        frame.y = baseY - frame.height / 2;
      } else { // bottom
        frame.y = baseY - frame.height;
      }
      
      currentX += frame.width + spacing;
    } catch (e) {
      console.warn('Could not arrange frame:', frame.name, e);
      // Continue with next frame even if one fails
    }
  }
}

function arrangeFramesVertical(frames: PositionedNode[], spacing: number, startX: number, startY: number, alignment: 'left' | 'center' | 'right' = 'left') {
  let currentY = startY;
  
  // Sort frames by original Y position
  const sortedFrames = [...frames].sort((a, b) => a.y - b.y);
  
  // Calculate the maximum width for alignment
  const maxWidth = Math.max(...sortedFrames.map(f => f.width));
  
  // Calculate base X position based on alignment
  let baseX: number;
  if (alignment === 'left') {
    baseX = startX;
  } else if (alignment === 'center') {
    baseX = startX + maxWidth / 2;
  } else { // right
    baseX = startX + maxWidth;
  }
  
  for (const frame of sortedFrames) {
    try {
      // Calculate X position based on alignment
      if (alignment === 'left') {
        frame.x = baseX;
      } else if (alignment === 'center') {
        frame.x = baseX - frame.width / 2;
      } else { // right
        frame.x = baseX - frame.width;
      }
      
      frame.y = currentY;
      currentY += frame.height + spacing;
    } catch (e) {
      console.warn('Could not arrange frame:', frame.name, e);
      // Continue with next frame even if one fails
    }
  }
}

function arrangeFramesMaintain(frames: PositionedNode[], spacing: number) {
  // For maintain mode, preserve the original positions of frames
  // Do not move or rearrange them - just keep them where they are
  // This function is essentially a no-op to maintain positions
}
