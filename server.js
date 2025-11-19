const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const validator = require('validator');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Industry configurations
const industryConfigs = {
    dental: {
        keywords: ["dental implants", "cosmetic dentistry", "family dentist", "teeth whitening", "dental emergency"],
        searchQuery: "best dental {location}",
        description: "Dental practices with online booking"
    },
    mortgage: {
        keywords: ["mortgage rates", "home loan", "refinance", "first time home buyer"],
        searchQuery: "mortgage lenders {location}",
        description: "Mortgage companies with online applications"
    },
    lawyer: {
        keywords: ["personal injury lawyer", "divorce attorney", "criminal defense", "business lawyer"],
        searchQuery: "best attorneys {location}",
        description: "Law firms with case evaluation forms"
    },
    realestate: {
        keywords: ["real estate agent", "home for sale", "property management", "realtor"],
        searchQuery: "real estate agents {location}",
        description: "Real estate agencies with property search"
    },
    insurance: {
        keywords: ["auto insurance", "home insurance", "life insurance", "health insurance"],
        searchQuery: "insurance companies {location}",
        description: "Insurance providers with quote forms"
    }
};

// Real Google Search Scraper
async function googleSearch(query, numResults = 20) {
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${numResults}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });
        
        // Extract organic results
        const results = await page.evaluate(() => {
            const items = [];
            const organicResults = document.querySelectorAll('div.g');
            
            organicResults.forEach(result => {
                const titleElement = result.querySelector('h3');
                const linkElement = result.querySelector('a');
                const urlElement = result.querySelector('cite');
                
                if (titleElement && linkElement) {
                    const title = titleElement.innerText;
                    const url = linkElement.href;
                    const displayUrl = urlElement ? urlElement.innerText : '';
                    
                    items.push({
                        title,
                        url,
                        displayUrl
                    });
                }
            });
            
            return items;
        });
        
        return results.slice(0, numResults);
    } finally {
        await browser.close();
    }
}

// Advanced Website Scanner
async function scanWebsite(url) {
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setDefaultTimeout(30000);
        
        const websiteData = {
            url,
            hasChat: false,
            hasForm: false,
            phones: [],
            emails: [],
            loadTime: 0,
            status: 'success'
        };
        
        try {
            const startTime = Date.now();
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            websiteData.loadTime = Date.now() - startTime;
            
            // Scan for chat widgets
            const chatSelectors = [
                '.intercom', '.drift', '[id*="chat"]', '[class*="chat"]',
                '.livechat', '.tawk-button', '[id*="livechat"]',
                '.zsiq_float', '.olark-button', '.purechat',
                '[class*="live-support"]', '[id*="support-chat"]'
            ];
            
            websiteData.hasChat = await page.evaluate((selectors) => {
                return selectors.some(selector => {
                    const elements = document.querySelectorAll(selector);
                    return elements.length > 0;
                });
            }, chatSelectors);
            
            // Scan for contact forms
            websiteData.hasForm = await page.evaluate(() => {
                const forms = document.querySelectorAll('form');
                return Array.from(forms).some(form => {
                    const formHtml = form.innerHTML.toLowerCase();
                    return formHtml.includes('contact') || 
                           formHtml.includes('email') || 
                           formHtml.includes('phone') || 
                           formHtml.includes('submit') ||
                           formHtml.includes('consultation') ||
                           formHtml.includes('appointment');
                });
            });
            
            // Extract all text content for phone/email scanning
            const content = await page.evaluate(() => document.body.innerText);
            
            // Enhanced phone number extraction
            const phoneRegex = /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g;
            const phones = content.match(phoneRegex) || [];
            websiteData.phones = [...new Set(phones)].filter(phone => 
                phone.replace(/\D/g, '').length >= 10
            );
            
            // Enhanced email extraction with validation
            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const emails = content.match(emailRegex) || [];
            websiteData.emails = [...new Set(emails)].filter(email => 
                validator.isEmail(email) && 
                !email.includes('noreply') &&
                !email.includes('no-reply') &&
                !email.includes('email.com') // Filter temporary emails
            );
            
        } catch (error) {
            console.log(`❌ Error scanning ${url}:`, error.message);
            websiteData.status = 'error';
            websiteData.error = error.message;
        }
        
        return websiteData;
        
    } finally {
        await browser.close();
    }
}

// Lead Scoring Algorithm
function calculateLeadScore(websiteData) {
    let score = 0;
    
    if (websiteData.hasChat) score += 10;
    if (websiteData.hasForm) score += 5;
    if (websiteData.phones.length > 0) score += 3;
    if (websiteData.emails.length > 0) score += 2;
    if (websiteData.loadTime < 3000) score += 1; // Fast loading site
    
    return Math.min(score, 20); // Cap at 20
}

// API Routes
app.post('/api/scan-industry', async (req, res) => {
    const { industry, location, customQuery } = req.body;
    
    try {
        const config = industryConfigs[industry];
        if (!config) {
            return res.status(400).json({ error: 'Invalid industry' });
        }
        
        const searchQuery = customQuery || config.searchQuery.replace('{location}', location);
        
        console.log(`🔍 Searching Google for: ${searchQuery}`);
        const searchResults = await googleSearch(searchQuery, 15);
        
        console.log(`📊 Found ${searchResults.length} search results, starting website scanning...`);
        
        const leads = [];
        let processed = 0;
        
        // Scan each website (limit to 10 for demo)
        for (const result of searchResults.slice(0, 10)) {
            try {
                console.log(`🌐 Scanning: ${result.url}`);
                const websiteData = await scanWebsite(result.url);
                
                const leadScore = calculateLeadScore(websiteData);
                
                leads.push({
                    id: leads.length + 1,
                    name: result.title,
                    website: result.url,
                    displayUrl: result.displayUrl,
                    hasChat: websiteData.hasChat,
                    hasForm: websiteData.hasForm,
                    phones: websiteData.phones,
                    emails: websiteData.emails,
                    loadTime: websiteData.loadTime,
                    score: leadScore,
                    location: location,
                    industry: industry,
                    status: websiteData.status
                });
                
                processed++;
                console.log(`✅ Processed ${processed}/${Math.min(searchResults.length, 10)} - Score: ${leadScore}`);
                
            } catch (error) {
                console.log(`❌ Failed to scan ${result.url}:`, error.message);
            }
        }
        
        res.json({
            success: true,
            leads: leads.sort((a, b) => b.score - a.score),
            stats: {
                total: leads.length,
                withChat: leads.filter(l => l.hasChat).length,
                withForm: leads.filter(l => l.hasForm).length,
                withContact: leads.filter(l => l.phones.length > 0 || l.emails.length > 0).length
            }
        });
        
    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ error: 'Scanning failed: ' + error.message });
    }
});

app.post('/api/export-csv', async (req, res) => {
    const { leads, industry } = req.body;
    
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `leads-${industry}-${timestamp}.csv`;
        const filepath = path.join(__dirname, 'exports', filename);
        
        // Ensure exports directory exists
        if (!fs.existsSync(path.join(__dirname, 'exports'))) {
            fs.mkdirSync(path.join(__dirname, 'exports'));
        }
        
        const csvWriter = createObjectCsvWriter({
            path: filepath,
            header: [
                { id: 'name', title: 'BUSINESS_NAME' },
                { id: 'website', title: 'WEBSITE' },
                { id: 'phones', title: 'PHONES' },
                { id: 'emails', title: 'EMAILS' },
                { id: 'hasChat', title: 'HAS_LIVE_CHAT' },
                { id: 'hasForm', title: 'HAS_CONTACT_FORM' },
                { id: 'score', title: 'LEAD_SCORE' },
                { id: 'location', title: 'LOCATION' },
                { id: 'industry', title: 'INDUSTRY' }
            ]
        });
        
        // Format data for CSV
        const csvData = leads.map(lead => ({
            ...lead,
            phones: lead.phones.join('; '),
            emails: lead.emails.join('; ')
        }));
        
        await csvWriter.writeRecords(csvData);
        
        res.download(filepath, filename, (err) => {
            if (err) {
                console.error('Download error:', err);
                res.status(500).json({ error: 'Download failed' });
            }
            
            // Clean up file after download
            setTimeout(() => {
                fs.unlinkSync(filepath);
            }, 30000);
        });
        
    } catch (error) {
        console.error('CSV export error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

// CRM Integration Webhooks (Example - HubSpot)
app.post('/api/crm/hubspot', async (req, res) => {
    const { leads, hubspotApiKey } = req.body;
    
    // This would integrate with HubSpot API
    // Implementation would depend on specific CRM requirements
    
    res.json({ 
        success: true, 
        message: 'CRM integration placeholder - would connect to HubSpot API',
        leadsProcessed: leads.length 
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Marketing Intelligence Pro running on http://localhost:${PORT}`);
    console.log(`🎯 Real Google scraping enabled`);
    console.log(`🔍 Advanced website scanning ready`);
    console.log(`📊 CSV export functionality active`);
});