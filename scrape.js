const puppeteer = require('puppeteer');
const cron = require('node-cron');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config()

// Configure AWS S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;


const locations = [
    'branimir', 'dubrava', 'greengold', 'dvorana', 'hala', 'hob',
    'kaptol', 'mamutica', 'zcentar', 'zavrtnica', 'zonar'
];

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
    'zonar': 'The Fitness Zonar Hotel'
}

const scrapeAndUpload = async (location) => {
    console.log(`[${new Date().toISOString()}] Starting process for ${location}`);
    const url = `https://${location}.thefitness.hr/calendar`;
    const baseUrl = `https://${location}.thefitness.hr`;
    
    console.log(`[${new Date().toISOString()}] Launching browser for ${location}`);
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log(`[${new Date().toISOString()}] Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    
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

    try {
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
        console.error(`[${new Date().toISOString()}] ❌ Error uploading to S3 for ${location}:`, err);
    }

    console.log(`[${new Date().toISOString()}] Closing browser for ${location}`);
    await browser.close();
    console.log(`[${new Date().toISOString()}] Process completed for ${location}\n`);
};

// Schedule to run every 30 minutes
cron.schedule('5 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for branimir location...`);
    scrapeAndUpload('branimir')
});

cron.schedule('10 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for dubrava location...`);
    scrapeAndUpload('dubrava')
});

cron.schedule('15 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for greengold location...`);
    scrapeAndUpload('greengold')
});

cron.schedule('20 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for hala location...`);
    scrapeAndUpload('hala')
});

cron.schedule('25 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for dvorana location...`);
    scrapeAndUpload('dvorana')
});

cron.schedule('30 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for hob location...`);
    scrapeAndUpload('hob')
});

cron.schedule('35 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for kaptol location...`);
    scrapeAndUpload('kaptol')
});

cron.schedule('40 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for mamutica location...`);
    scrapeAndUpload('mamutica')
});

cron.schedule('45 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for zcentar location...`);
    scrapeAndUpload('zcentar')
});

cron.schedule('50 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for zavrtnica location...`);
    scrapeAndUpload('zavrtnica')
});

cron.schedule('55 * * * *', () => {
    console.log(`\n[${new Date().toISOString()}] 🔄 Starting new cron job cycle`);
    console.log(`[${new Date().toISOString()}] Running scraper for zonar location...`);
    scrapeAndUpload('zonar')
});

// Run once on startup
console.log(`[${new Date().toISOString()}] 🚀 Initial startup`);

scrapeAndUpload('hala')
setTimeout(() => {
    scrapeAndUpload('hob')
}, 10000)
