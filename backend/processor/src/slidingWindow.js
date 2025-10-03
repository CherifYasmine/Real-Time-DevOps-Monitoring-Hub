class SlidingWindowAggregator {
  constructor({ windowSizeMs = 60000, logger = console } = {}) {
    this.windowSizeMs = windowSizeMs;
    this.logger = logger;
    this.windows = new Map(); // key -> { data: [], lastCleanup: timestamp }
  }

  // Add data point to a specific window
  addDataPoint(windowKey, dataPoint) {
    const now = Date.now();
    
    if (!this.windows.has(windowKey)) {
      this.windows.set(windowKey, { data: [], lastCleanup: now });
    }

    const window = this.windows.get(windowKey);
    
    // Add timestamp if not present
    if (!dataPoint.timestamp) {
      dataPoint.timestamp = now;
    }

    window.data.push(dataPoint);
    
    // Cleanup old data periodically
    if (now - window.lastCleanup > this.windowSizeMs / 4) {
      this.cleanup(windowKey, now);
      window.lastCleanup = now;
    }
  }

  // Remove data points older than the window
  cleanup(windowKey, currentTime = Date.now()) {
    const window = this.windows.get(windowKey);
    if (!window) return;

    const cutoff = currentTime - this.windowSizeMs;
    window.data = window.data.filter(point => point.timestamp > cutoff);
  }

  // Get current data in window
  getWindowData(windowKey) {
    this.cleanup(windowKey);
    const window = this.windows.get(windowKey);
    return window ? window.data : [];
  }

  // Calculate error rate for log messages
  calculateErrorRate(windowKey) {
    const data = this.getWindowData(windowKey);
    if (data.length === 0) return 0;

    const errorCount = data.filter(point => 
      point.level === 'error' || point.level === 'ERROR'
    ).length;
    
    return errorCount / data.length;
  }

  // Calculate average for numeric metrics
  calculateAverage(windowKey, field) {
    const data = this.getWindowData(windowKey);
    if (data.length === 0) return 0;

    const values = data
      .map(point => point[field])
      .filter(val => typeof val === 'number');
      
    if (values.length === 0) return 0;
    
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  // Calculate count of messages in window
  calculateCount(windowKey) {
    return this.getWindowData(windowKey).length;
  }

  // Get window summary stats
  getWindowStats(windowKey) {
    const data = this.getWindowData(windowKey);
    const now = Date.now();
    
    return {
      windowKey,
      count: data.length,
      windowSizeMs: this.windowSizeMs,
      oldestTimestamp: data.length > 0 ? Math.min(...data.map(p => p.timestamp)) : now,
      newestTimestamp: data.length > 0 ? Math.max(...data.map(p => p.timestamp)) : now,
      generatedAt: now
    };
  }

  // Clear old windows that haven't been used
  cleanupWindows(maxIdleMs = this.windowSizeMs * 2) {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, window] of this.windows) {
      if (now - window.lastCleanup > maxIdleMs) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.windows.delete(key);
      this.logger.debug({ windowKey: key }, 'Cleaned up idle window');
    });
  }
}

module.exports = SlidingWindowAggregator;