# AWS Cost Optimization Summary

## Optimizations Implemented

### 1. **Browser Launch Optimization** (Biggest Impact)
Added 17 Puppeteer flags to minimize memory and CPU usage:
- `--disable-dev-shm-usage`: Prevents Chrome from using `/dev/shm` (shared memory)
- `--disable-gpu`: Disables GPU hardware acceleration
- `--no-sandbox`: Reduces sandboxing overhead
- `--disable-setuid-sandbox`: Further reduces sandboxing
- And 13 more flags to disable unnecessary features

**Estimated savings: 40-60% memory reduction per browser instance**

### 2. **Faster Page Loading**
Changed from `networkidle2` to `domcontentloaded`:
- `networkidle2`: Waits for 500ms with max 2 connections (slow)
- `domcontentloaded`: Loads as soon as DOM is ready (faster)

**Estimated savings: 30-50% faster page loads = less CPU time**

### 3. **Memory Leak Prevention**
- Added try/catch/finally blocks to ensure browser always closes
- Added forced garbage collection after each scrape
- Added memory usage logging for monitoring

**Estimated savings: Prevents memory accumulation over time**

### 4. **Proper Error Handling**
- Wrapped all cron jobs with error handlers
- Browser closure is guaranteed even if scrape fails
- Added timeouts to prevent hanging processes

**Estimated savings: Prevents zombie processes consuming resources**

### 5. **Viewport Optimization**
Set explicit viewport size (1920x1080) to control memory usage

### 6. **Timeout Management**
Added 30-second timeouts to all page operations to prevent hanging

## Running the Optimized Version

### Standard Mode
```bash
node scrape.js
```

### With Garbage Collection (Recommended)
```bash
node --expose-gc scrape.js
```
This enables forced garbage collection, keeping memory usage lower.

## Further Cost Reduction Options

### Option 1: Reduce Scraping Frequency
Currently scraping every hour (14 locations × 24 hours = 336 scrapes/day)

Consider reducing to every 2-3 hours if gym schedules don't change frequently:
- Every 2 hours: 168 scrapes/day (50% reduction)
- Every 3 hours: 112 scrapes/day (67% reduction)

### Option 2: Downgrade Instance Size
With these optimizations, you might be able to use:
- **t3.micro** or **t3.small** instead of medium
- This would reduce costs by 50-70%

### Option 3: Use AWS Lambda Instead
For simple scraping tasks, Lambda could be more cost-effective:
- Only pay for execution time
- No idle server costs
- May require additional setup for Puppeteer

### Option 4: Use Puppeteer Extra with Stealth Plugin
If you need to scrape more efficiently, consider `puppeteer-extra` with stealth plugin to avoid blocks and reduce retries.

## Monitoring

The script now logs:
- Memory usage before and after each scrape
- Browser launch/close events
- All errors with context
- Garbage collection events (if enabled)

Use these logs to:
1. Identify memory leaks
2. Optimize scraping times
3. Detect failing locations
4. Calculate actual resource usage

## Expected Resource Usage

**Before optimization:**
- Memory: ~1.5-2GB peak
- CPU: High spikes during scraping

**After optimization:**
- Memory: ~600MB-1GB peak
- CPU: Moderate usage, more distributed

## EC2 Instance Recommendations

Based on optimized usage:
- **t3.small** (2GB RAM): Should be sufficient
- **t3.micro** (1GB RAM): Might work with reduced frequency
- **t3.medium** (4GB RAM): Overkill, but provides safety margin

## Cost Estimation

Switching from **t3.medium** to **t3.small**:
- t3.medium: ~$30/month
- t3.small: ~$15/month
- **Savings: ~$15/month (50%)**

