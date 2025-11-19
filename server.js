const express = require('express');
const https = require('https');
const http = require('http');
const { parse } = require('url');
const cheerio = require('cheerio');
const cors = require('cors');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Simple HTTP client without axios/undici
function fetchWebsite(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = parse(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve(data);
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// Industry configurations
const industryConfigs = {
    dental: {
        keywords: ["dental implants", "cosmetic dentistry", "family dentist", "teeth whitening", "dental emergency"],
        searchQuery: "best dental {location}",
        description: "Dental practices with online booking"
    },
    mortgage: {
        keywords: ["mortgage rates", "home loan", "refinance", "first time home buyer", "mortgage pre-approval"],
        searchQuery: "mortgage lenders {location}",
        description: "Mortgage companies with online applications"
    },
    lawyer: {
        keywords: ["personal injury lawyer", "divorce attorney", "criminal defense", "estate planning", "business lawyer"],
        searchQuery: "best attorneys {location}",
        description: "Law firms with case evaluation forms"
    },
    realestate: {
        keywords: ["real estate agent", "home for sale", "property management", "commercial real estate", "realtor"],
        searchQuery: "real estate agents {location}",
        description: "Real estate agencies with property search"
    },
    insurance: {
        keywords: ["auto insurance", "home insurance", "life insurance", "health insurance", "business insurance"],
        searchQuery: "insurance companies {location}",
        description: "Insurance providers with quote forms"
    },
    medical: {
        keywords: ["primary care physician", "specialist doctor", "medical clinic", "healthcare provider", "urgent care"],
        searchQuery: "best doctors {location}",
        description: "Medical practices with patient portals"
    }
};

// Website scanner without axios/undici
app.post('/api/scan-website', async (req, res) => {
    const { url } = req.body;
    
    try {
        console.log(`🔍 Scanning website: ${url}`);
        
        const html = await fetchWebsite(url);
        const $ = cheerio.load(html);
        
        // Detect contact forms
        const forms = $('form');
        const hasForm = forms.length > 0;
        
        // Check if forms are contact-related
        const contactForms = Array.from(forms).filter(form => {
            const formHtml = $(form).html().toLowerCase();
            return formHtml.includes('contact') || 
                   formHtml.includes('email') || 
                   formHtml.includes('phone') ||
                   formHtml.includes('name') ||
                   formHtml.includes('consultation') ||
                   formHtml.includes('appointment') ||
                   formHtml.includes('message') ||
                   formHtml.includes('submit');
        });
        
        const hasContactForm = contactForms.length > 0;
        
        // Detect chat widgets in HTML
        const chatSelectors = [
            '[class*="chat"]', '[id*="chat"]', 
            '.intercom', '.drift', '.livechat', 
            '.tawk-button', '.olark', '.purechat',
            '[class*="live-support"]', '[id*="support-chat"]',
            '.zendesk', '.helpcrunch', '.crisp'
        ];
        
        const hasChat = chatSelectors.some(selector => $(selector).length > 0);
        
        // Also check for chat in text content
        const pageText = $('body').text().toLowerCase();
        const hasChatText = pageText.includes('live chat') || 
                           pageText.includes('chat now') || 
                           pageText.includes('online chat');
        
        // Extract contact info
        const phoneRegex = /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g;
        const phones = pageText.match(phoneRegex) || [];
        
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = pageText.match(emailRegex) || [];
        
        // Calculate lead score
        let score = 0;
        if (hasChat || hasChatText) score += 10;
        if (hasContactForm) score += 8;
        if (hasForm) score += 3;
        if (phones.length > 0) score += 3;
        if (emails.length > 0) score += 2;
        
        // Remove duplicates and limit results
        const uniquePhones = [...new Set(phones)].slice(0, 3);
        const uniqueEmails = [...new Set(emails)]
            .filter(email => !email.includes('noreply') && 
                            !email.includes('no-reply') &&
                            !email.includes('email.com'))
            .slice(0, 3);
        
        console.log(`✅ Scan completed: ${url} - Score: ${score}`);
        
        res.json({
            success: true,
            hasChat: hasChat || hasChatText,
            hasForm: hasContactForm,
            hasAnyForm: hasForm,
            phones: uniquePhones,
            emails: uniqueEmails,
            formsCount: forms.length,
            contactFormsCount: contactForms.length,
            score: Math.min(score, 25),
            insights: generateInsights(hasChat, hasContactForm, uniquePhones, uniqueEmails, score)
        });
        
    } catch (error) {
        console.log(`❌ Scan failed: ${url} - ${error.message}`);
        res.json({
            success: false,
            error: error.message
        });
    }
});

function generateInsights(hasChat, hasForm, phones, emails, score) {
    const insights = [];
    
    if (hasChat) insights.push("💬 Has live chat - HIGH conversion potential");
    if (hasForm) insights.push("📝 Contact form detected - understands lead generation");
    if (phones.length > 0) insights.push(`📞 ${phones.length} phone numbers found`);
    if (emails.length > 0) insights.push(`✉️ ${emails.length} email addresses found`);
    if (score >= 15) insights.push("🔥 Premium lead - urgent follow-up recommended");
    if (score >= 10) insights.push("⭐ High-value prospect");
    
    return insights;
}

// Industry search with sample data
app.post('/api/search-industry', async (req, res) => {
    const { industry, location, customQuery } = req.body;
    
    console.log(`🎯 Industry search: ${industry} in ${location}`);
    
    try {
        // Generate realistic sample leads
        const leads = generateSampleLeads(industry, location, 12);
        
        // Calculate stats
        const stats = {
            total: leads.length,
            withChat: leads.filter(l => l.hasChat).length,
            withForm: leads.filter(l => l.hasForm).length,
            withContact: leads.filter(l => l.phones.length > 0 || l.emails.length > 0).length,
            highValue: leads.filter(l => l.score >= 15).length
        };
        
        res.json({ 
            success: true, 
            leads: leads,
            stats: stats,
            message: `Found ${leads.length} ${industry} leads in ${location}`
        });
        
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

function generateSampleLeads(industry, location, count = 12) {
    const businessTemplates = {
        dental: ["Perfect Smile Dental", "Bright Now Dental", "Aspen Dental", "Western Dental", "Coast Dental", "Modern Dentistry", "Elite Dental Care", "Premier Dental", "Family Dental Center", "Cosmetic Dentistry", "Emergency Dental", "Smile Design"],
        mortgage: ["Rocket Mortgage", "Quicken Loans", "Wells Fargo Mortgage", "Bank of America Home Loans", "Chase Mortgage", "LoanDepot", "Freedom Mortgage", "Guaranteed Rate", "New American Funding", "Fairway Mortgage", "Movement Mortgage", "Caliber Home Loans"],
        lawyer: ["Morgan & Morgan", "Cellino & Barnes", "Jacoby & Meyers", "Weitz & Luxenberg", "Simmons Hanly", "Anapol Weiss", "Levin Papantonio", "Lieff Cabraser", "Baron & Budd", "Girardi Keese", "Personal Injury Law", "Legal Defense Group"],
        realestate: ["Keller Williams", "RE/MAX", "Coldwell Banker", "Century 21", "Sotheby's Realty", "Redfin", "Zillow Premier", "Compass Real Estate", "Better Homes", "ERA Real Estate", "Local Properties", "Premier Agents"],
        insurance: ["State Farm", "Geico", "Progressive", "Allstate", "Liberty Mutual", "Nationwide", "Farmers Insurance", "Travelers", "American Family", "USAA", "Local Insurance", "Premier Coverage"],
        medical: ["Mayo Clinic", "Cleveland Clinic", "Johns Hopkins", "Mass General", "UCLA Health", "NYU Langone", "Northwestern Medicine", "Stanford Health", "Cedars-Sinai", "Mount Sinai", "Local Medical", "Healthcare Partners"]
    };
    
    const suffixes = ["Inc", "LLC", "Group", "Associates", "Partners", "Center", "Clinic", "Solutions"];
    
    return Array.from({ length: count }, (_, i) => {
        const baseName = businessTemplates[industry][i % businessTemplates[industry].length];
        const suffix = suffixes[i % suffixes.length];
        const name = `${baseName} ${suffix}`;
        
        // Realistic distribution for demo
        const hasChat = i < 4;
        const hasForm = i < 8;
        const hasPhone = i < 10;
        const hasEmail = i < 6;
        
        const score = (hasChat ? 10 : 0) + (hasForm ? 8 : 0) + 
                     (hasPhone ? 3 : 0) + (hasEmail ? 2 : 0);
        
        return {
            id: i + 1,
            name: `${name} - ${location}`,
            website: `https://www.${name.toLowerCase().replace(/\s+/g, '')}.com`,
            phone: hasPhone ? `(${555}) ${100 + i}-${1000 + i}` : null,
            email: hasEmail ? `contact@${name.toLowerCase().replace(/\s+/g, '')}.com` : null,
            hasChat,
            hasForm,
            hasPhone,
            hasEmail,
            score,
            location,
            industry,
            description: `${industry} services in ${location}`
        };
    }).sort((a, b) => b.score - a.score);
}

app.listen(PORT, () => {
    console.log(`🚀 Marketing Intelligence Pro - COMPATIBLE VERSION`);
    console.log(`✅ Running on port: ${PORT}`);
    console.log(`✅ No axios/undici - Pure Node.js HTTP client`);
    console.log(`✅ Ready to scan websites!`);
});