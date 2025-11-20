const puppeteer = require('puppeteer');
const cron = require('node-cron');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config()
const cronitor = require('cronitor')(process.env.CRONITOR_API_KEY);

cronitor.wraps(cron);

// Log memory usage periodically for monitoring
const logMemoryUsage = () => {
    const used = process.memoryUsage();
    console.log(`[${new Date().toISOString()}] Memory Usage: RSS: ${Math.round(used.rss / 1024 / 1024)}MB, Heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB / ${Math.round(used.heapTotal / 1024 / 1024)}MB`);
};

// Force garbage collection periodically if available
if (global.gc) {
    setInterval(() => {
        global.gc();
        console.log(`[${new Date().toISOString()}] Forced garbage collection`);
    }, 10 * 60 * 1000); // Every 10 minutes
}

// Configure AWS S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

const locationNames = {
    'branimir': 'The Fitness Branimir Mingle Mall',
    'dubrava': 'The Fitness Dubrava',
    'greengold': 'The Fitness Green Gold Centar ',
    'dvorana': 'The Fitness Dvorana',
    'hala': 'The Fitness and Padel Hala',
    'hob': 'The Fitness Hob',
    'kaptol': 'The Fitness Kaptol Center',
    'mamutica': 'The Fitness Mamutica',
    'zcentar': 'The Fitness Z Centar',
    'zavrtnica': 'The Fitness Zavrtnica',
    'zonar': 'The Fitness Zonar Hotel',
    'lucko': 'The Fitness Lučko',
    'jelkovec': 'The Fitness Jelkovec',
    'hotelnovi': 'The Fitness Hotel Novi',
}

const scrapeAndUpload = async (location) => {
    let browser = null;
    try {
        console.log(`[${new Date().toISOString()}] Starting process for ${location}`);
        const url = `https://${location}.thefitness.hr/calendar`;
        const baseUrl = `https://${location}.thefitness.hr`;
        
        console.log(`[${new Date().toISOString()}] Launching browser for ${location}`);
        
        // Optimized browser launch with minimal resource usage
        browser = await puppeteer.launch({ 
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Overcome limited resource problems
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-software-rasterizer',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        });
        
        const page = await browser.newPage();
        
        // Set smaller viewport to reduce memory usage
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set request timeout
        page.setDefaultNavigationTimeout(30000);
        page.setDefaultTimeout(30000);
        
        console.log(`[${new Date().toISOString()}] Navigating to ${url}`);
        // Use domcontentloaded instead of networkidle2 for faster loading
        await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        // Wait for calendar table to ensure DOM is fully ready
        await page.waitForSelector('.calendar_table', { timeout: 10000 }).catch(() => {
            console.log(`[${new Date().toISOString()}] Calendar table not found, continuing anyway...`);
        });
    
        console.log(`[${new Date().toISOString()}] Starting HTML manipulation for ${location}`);
        const cleanedHTML = await page.evaluate((baseUrl, location, locationNames) => {
        // Remove last two columns from calendar table
        const calendarTable = document.querySelector('.calendar_table');
        if (calendarTable) {
            const rows = calendarTable.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length >= 2) {
                    cells[cells.length - 1].remove(); // Remove last column
                    if(location !== 'hala' && location !== 'hob') {
                        cells[cells.length - 2].remove(); // Remove second to last column
                    }
                }
            });
        }

        document.querySelectorAll('div.event').forEach(event => {
            const eventName = event.querySelector('p.event_name');
            event.style.height = '100%';
            event.style.minHeight = '130px';
            event.style.marginBottom = '20px';
            event.style.marginTop = '10px';
            const eventTime = event.querySelector('span.eventlength');
            if (eventTime) eventTime.style.fontSize = '17px';
            if (eventName) eventName.style.fontSize = '22px';
            if (eventName.textContent.toUpperCase().trim() === 'FATBURNING CONDITIONING') eventName.style.fontSize = '18px';
            if (eventName.textContent.toUpperCase().trim() === 'BODYWEIGHT') eventName.style.fontSize = '21px';
            const room = event.querySelector('p.room');
            if (room) room.style.fontSize = '18px';

            if (eventName && eventName.textContent.trim() === 'Padel') {
                event.remove();
            }
        });

        // Remove language selection popup
        const languagePopup = document.querySelector('.language-selection');
        if (languagePopup) languagePopup.remove();

        // Also remove any overlay/backdrop that might be associated with it
        const overlay = document.querySelector('.language-selection-overlay');
        if (overlay) overlay.remove();

        // Set HTML language to Croatian
        document.documentElement.lang = 'hr';
        document.documentElement.translate = 'no';
        document.documentElement.classList.add('notranslate');

        document.body.style.backgroundColor = 'black';

        const innerContainer = document.getElementById('innercontainer');
        if (innerContainer) {
            // Create location name header instead of logo
            innerContainer.style.display = 'flex';
            innerContainer.style.flexDirection = 'column';
            innerContainer.style.flex = '1';

            const locationDiv = document.createElement('div');
            locationDiv.style.display = 'flex';
            locationDiv.style.flexDirection = 'column';
            locationDiv.style.justifyContent = 'center';
            locationDiv.style.alignItems = 'center';
            locationDiv.style.borderBottom = '2px solid white';
            locationDiv.style.marginBottom = '20px';
            locationDiv.style.marginLeft = '20px';
            locationDiv.style.marginRight = '20px';

            const locationName = document.createElement('h1');
            locationName.textContent = locationNames[location];
            locationName.style.color = 'white';
            locationName.style.fontSize = '6em';
            locationName.style.marginBottom = '10px';
            locationName.style.textAlign = 'center';
            locationName.setAttribute('style', 'text-align: center !important; color: white; font-size: 6em; margin-bottom: 10px;');
            locationDiv.appendChild(locationName);

            const raspored = document.createElement('h2');
            raspored.textContent = 'Raspored treninga';
            raspored.style.color = 'white';
            raspored.style.fontSize = '3em';
            raspored.style.marginBottom = '35px';
            locationDiv.appendChild(raspored);

            innerContainer.parentNode.insertBefore(locationDiv, innerContainer);
        }

        const scheduler = document.getElementById('scheduler');
        if (scheduler) {
            scheduler.style.backgroundColor = 'black';
            scheduler.style.marginTop = '20px';
        }

        const calendarHeader = document.querySelector('section.calendar_header h1');
        if (calendarHeader) calendarHeader.style.color = 'white';

    
        const header = document.querySelector('header');
        if (header) header.remove();

        const mobileIcons = document.querySelector('.mobile-icons');
        if (mobileIcons) mobileIcons.remove();

        const footer = document.querySelector('footer');
        if (footer) footer.remove();

        const calendarMain = document.querySelector('section.calendar_main');
        if (calendarMain) calendarMain.remove();
        
        document.querySelectorAll('link[href]').forEach(link => {
            if (link.getAttribute('href') && link.getAttribute('href').startsWith('/')) {
                link.setAttribute('href', baseUrl + link.getAttribute('href'));
            }
        });

        const wideContainer = document.getElementById('widecontainer');
        
        const calendarHeaderSection = document.querySelector('section.calendar_header');
        if (calendarHeaderSection) calendarHeaderSection.remove();

        
        if (wideContainer) {
            wideContainer.style.display = 'flex';
            wideContainer.style.flexDirection = 'column';
            wideContainer.style.justifyContent = 'space-between';
            wideContainer.style.minHeight = '100vh';

            // Create bottom logo
            const logoContainer = document.createElement('div');
            logoContainer.style.display = 'flex';
            logoContainer.style.alignItems = 'flex-end';
            logoContainer.style.justifyContent = 'center';
            logoContainer.style.padding = '20px';
            logoContainer.style.paddingTop = '40px';
            logoContainer.style.marginLeft = '20px';
            logoContainer.style.marginRight = '20px';
            logoContainer.style.borderTop = '2px solid white';

            const logo = document.createElement('img');
            logo.src = 'https://www.formfactory.cz/timetable/the-fitness-logo.png';
            logo.style.width = '400px';
            logo.style.height = 'auto';
            logo.style.marginBottom = '20px';
            
            logoContainer.appendChild(logo);
            wideContainer.appendChild(logoContainer);
        }

        const calendarDownerText = document.getElementById('calendar_downer_text');
        if (calendarDownerText) calendarDownerText.remove();
        
        document.querySelectorAll('script[src]').forEach(script => {
            if (script.getAttribute('src') && script.getAttribute('src').startsWith('/')) {
                script.setAttribute('src', baseUrl + script.getAttribute('src'));
            }
        });

        const head = document.querySelector('head');
        if (head) {
            const noCacheMetaTags = `
                <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, proxy-revalidate" />
                <meta http-equiv="Pragma" content="no-cache" />
                <meta http-equiv="Expires" content="0" />
                <meta name="google" content="notranslate" />
            `;
            head.insertAdjacentHTML('beforeend', noCacheMetaTags);
        }
        
        return document.documentElement.outerHTML;
    }, baseUrl, location, locationNames);
    
        console.log(`[${new Date().toISOString()}] HTML cleaning completed for ${location}`);

        console.log(`[${new Date().toISOString()}] Preparing S3 upload for ${location}`);
        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: `${location}/index.html`,
            Body: cleanedHTML,
            ContentType: 'text/html',
            CacheControl: 'no-cache, no-store, must-revalidate',
        };

        console.log(`[${new Date().toISOString()}] Starting S3 upload for ${location} to bucket ${BUCKET_NAME}`);
        await s3Client.send(new PutObjectCommand(uploadParams));
        console.log(`[${new Date().toISOString()}] ✅ Successfully uploaded HTML for ${location} to S3 ${BUCKET_NAME}`);

    } catch (err) {
        console.error(`[${new Date().toISOString()}] ❌ Error in scrape process for ${location}:`, err);
        throw err; // Re-throw to be caught by outer error handler
    } finally {
        // Always close browser to prevent memory leaks
        if (browser) {
            console.log(`[${new Date().toISOString()}] Closing browser for ${location}`);
            try {
                await browser.close();
            } catch (closeErr) {
                console.error(`[${new Date().toISOString()}] Error closing browser for ${location}:`, closeErr);
            }
        }
        console.log(`[${new Date().toISOString()}] Process completed for ${location}\n`);
    }
};

// Wrapper function to handle errors in cron jobs
const runScrapeWithErrorHandling = async (location, jobName) => {
    try {
        console.log(`\n[${new Date().toISOString()}] 🔄 Starting cron job for ${jobName}`);
        logMemoryUsage();
        console.log(`[${new Date().toISOString()}] Running scraper for ${location} location...`);
        await scrapeAndUpload(location);
        logMemoryUsage();
        
        // Force garbage collection after each scrape if available
        if (global.gc) {
            global.gc();
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Fatal error in ${jobName} cron job:`, error);
        // Don't crash the entire process, just log the error
    }
};

// Schedule to run every hour with proper error handling
cronitor.schedule("Branimir", '5 * * * *', () => {
    runScrapeWithErrorHandling('branimir', 'Branimir');
});

cronitor.schedule("Dubrava", '10 * * * *', () => {
    runScrapeWithErrorHandling('dubrava', 'Dubrava');
});

cronitor.schedule("Green Gold", '15 * * * *', () => {
    runScrapeWithErrorHandling('greengold', 'Green Gold');
});

cronitor.schedule("Hala", '20 * * * *', () => {
    runScrapeWithErrorHandling('hala', 'Hala');
});

cronitor.schedule("Dvorana", '25 * * * *', () => {
    runScrapeWithErrorHandling('dvorana', 'Dvorana');
});

cronitor.schedule("Hob", '30 * * * *', () => {
    runScrapeWithErrorHandling('hob', 'Hob');
});

cronitor.schedule("Kaptol", '35 * * * *', () => {
    runScrapeWithErrorHandling('kaptol', 'Kaptol');
});

cronitor.schedule("Mamutica", '40 * * * *', () => {
    runScrapeWithErrorHandling('mamutica', 'Mamutica');
});

cronitor.schedule("Z Centar", '45 * * * *', () => {
    runScrapeWithErrorHandling('zcentar', 'Z Centar');
});

cronitor.schedule("Zavrtnica", '50 * * * *', () => {
    runScrapeWithErrorHandling('zavrtnica', 'Zavrtnica');
});

cronitor.schedule("Zonar", '55 * * * *', () => {
    runScrapeWithErrorHandling('zonar', 'Zonar');
});

cronitor.schedule("Lucko", '43 * * * *', () => {
    runScrapeWithErrorHandling('lucko', 'Lucko');
});

cronitor.schedule("Jelkovec", '28 * * * *', () => {
    runScrapeWithErrorHandling('jelkovec', 'Jelkovec');
});

cronitor.schedule("Hotel Novi", '13 * * * *', () => {
    runScrapeWithErrorHandling('hotelnovi', 'Hotel Novi');
});


// Run once on startup
console.log(`[${new Date().toISOString()}] 🚀 Initial startup - Optimized for low resource usage`);
console.log(`[${new Date().toISOString()}] Tip: Run with --expose-gc flag for better memory management: node --expose-gc scrape.js`);
logMemoryUsage();
console.log(`[${new Date().toISOString()}] 14 locations scheduled with staggered times to minimize resource spikes`);
