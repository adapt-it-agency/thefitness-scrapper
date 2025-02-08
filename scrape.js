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
const VIDEO_URL = `${process.env.AWS_BUCKET_VIDEO_URL}/Podravka+KIKIRIKI+MASLAC+no+audio.mp4`;


const locations = [
    'branimir', 'dubrava', 'greengold', 'dvorana', 'hala', 'hob',
    'kaptol', 'mamutica', 'zcentar', 'zavrtnica', 'zonar'
];

const scrapeAndUpload = async (location) => {
    const url = `https://${location}.thefitness.hr/calendar`;
    const baseUrl = `https://${location}.thefitness.hr`;
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const cleanedHTML = await page.evaluate((baseUrl, videoUrl) => {
        document.querySelectorAll('div.event').forEach(event => {
            const eventName = event.querySelector('p.event_name');
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
            const logoDiv = document.createElement('div');
            logoDiv.style.textAlign = 'center';
            const logo = document.createElement('img');
            logo.src = 'https://www.formfactory.cz/timetable/the-fitness-logo.png';
            logo.style.marginBottom = '20px';
            logo.style.width = '400px';
            logo.style.height = 'auto';
            logo.style.display = 'block';
            logo.style.marginLeft = 'auto';
            logo.style.marginRight = 'auto';
            logoDiv.appendChild(logo);
            innerContainer.parentNode.insertBefore(logoDiv, innerContainer);
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
        
        if (wideContainer) {
            wideContainer.style.display = 'flex';
            wideContainer.style.flexDirection = 'column';
            wideContainer.style.justifyContent = 'space-between';
            wideContainer.style.minHeight = '100vh';

            const video = document.createElement('video');
            video.src = videoUrl;
            video.style.position = 'relative';
            video.style.marginTop = '20px';
            video.style.top = 'unset';
            video.style.left = 'unset';
            video.style.right = 'unset';
            video.style.bottom = 'unset';
            video.style.transform = 'unset';
            video.style.zIndex = '1';
            video.style.width = '100%';
            video.style.height = 'auto';
            video.style.objectFit = 'cover';
            video.style.position = 'relative';
            video.style.paddingLeft = '20px';
            video.style.paddingRight = '20px';

            video.setAttribute('autoplay', 'true');
            video.setAttribute('loop', 'true');
            video.setAttribute('muted', 'true');
            video.setAttribute('playsinline', 'true');
            video.play().catch(function(error) {
                console.log("Video play failed:", error);
            });
            const videoContainer = document.createElement('div');
            videoContainer.style.display = 'flex';
            videoContainer.style.flex = '1';
            videoContainer.style.alignItems = 'flex-end';
            videoContainer.appendChild(video);
            wideContainer.appendChild(videoContainer);
        }
        
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
    }, baseUrl, VIDEO_URL);

    try {
        // Upload to S3
        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: `${location}/index.html`,
            Body: cleanedHTML,
            ContentType: 'text/html',
            CacheControl: 'no-cache, no-store, must-revalidate',
        };

        await s3Client.send(new PutObjectCommand(uploadParams));
        console.log(`Successfully uploaded HTML for ${location} to S3 ${BUCKET_NAME} at ${new Date().toISOString()}`);
    } catch (err) {
        console.error(`Date: ${new Date().toISOString()} Error uploading to S3 for ${location}:`, err);
    }

    await browser.close();
};

// Schedule to run every 30 minutes
cron.schedule('*/30 * * * *', () => {
    console.log(`Date: ${new Date().toISOString()} Running scraper for all locations...`);
    locations.forEach(location => scrapeAndUpload(location));
});

// Run once on startup
locations.forEach(location => scrapeAndUpload(location));
