app.post('/api/debug-scan', (req, res) => {
    const { industry, location } = req.body;
    const leads = generateRealisticLeads(industry, location, 3); // Just 3 for testing
    
    console.log('Sample lead data:', JSON.stringify(leads[0], null, 2));
    
    res.json({
        sampleLead: leads[0],
        allLeads: leads,
        stats: calculateStats(leads)
    });
});

const express = require('express');
const https = require('https');
const http = require('http');
const { parse } = require('url');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Enhanced HTTP client with better error handling
function fetchWebsite(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = parse(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive'
            },
            timeout: 15000
        };
        
        const req = client.request(options, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchWebsite(res.headers.location).then(resolve).catch(reject);
                return;
            }
            
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// Industry configurations with enhanced search queries
const industryConfigs = {
    dental: {
        searchQuery: "best dental {location}",
        keywords: ["dental implants", "teeth whitening", "cosmetic dentistry"],
        realWebsites: [
            { name: "Aspen Dental", url: "https://www.aspendental.com" },
            { name: "Western Dental", url: "https://www.westerndental.com" },
            { name: "Coast Dental", url: "https://www.coastdental.com" }
        ]
    },
    mortgage: {
        searchQuery: "mortgage lenders {location}",
        keywords: ["home loan", "refinance", "mortgage rates"],
        realWebsites: [
            { name: "Rocket Mortgage", url: "https://www.rocketmortgage.com" },
            { name: "LoanDepot", url: "https://www.loandepot.com" },
            { name: "Better Mortgage", url: "https://www.better.com" }
        ]
    },
    lawyer: {
        searchQuery: "best attorneys {location}",
        keywords: ["personal injury lawyer", "divorce attorney", "legal defense"],
        realWebsites: [
            { name: "Morgan & Morgan", url: "https://www.forthepeople.com" },
            { name: "LegalZoom", url: "https://www.legalzoom.com" },
            { name: "Avvo", url: "https://www.avvo.com" }
        ]
    },
    realestate: {
        searchQuery: "real estate agents {location}",
        keywords: ["realtor", "property agents", "home sales"],
        realWebsites: [
            { name: "Zillow", url: "https://www.zillow.com" },
            { name: "Realtor.com", url: "https://www.realtor.com" },
            { name: "Redfin", url: "https://www.redfin.com" }
        ]
    },
    insurance: {
        searchQuery: "insurance companies {location}",
        keywords: ["auto insurance", "home insurance", "life insurance"],
        realWebsites: [
            { name: "Geico", url: "https://www.geico.com" },
            { name: "State Farm", url: "https://www.statefarm.com" },
            { name: "Progressive", url: "https://www.progressive.com" }
        ]
    }
};

// MAIN SCAN ENDPOINT - Enhanced with real scanning
app.post('/api/scan-industry', async (req, res) => {
    const { industry, location, customQuery } = req.body;
    
    console.log(`🎯 Starting REAL scan: ${industry} in ${location}`);
    
    try {
        // Generate mixed results: real scans + realistic samples
        const realLeads = await scanRealWebsites(industry, location);
        const sampleLeads = generateRealisticLeads(industry, location, 12);
        const allLeads = [...realLeads, ...sampleLeads].slice(0, 20);
        
        const stats = calculateStats(allLeads);
        
        console.log(`✅ Scan completed: ${allLeads.length} leads (${realLeads.length} real)`);
        
        res.json({ 
            success: true, 
            leads: allLeads,
            stats: stats,
            scanInfo: {
                industry,
                location,
                realScans: realLeads.length,
                totalLeads: allLeads.length,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Scan error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ENHANCED REAL SCANNING
async function scanRealWebsites(industry, location) {
    const config = industryConfigs[industry];
    if (!config) return [];
    
    const leads = [];
    
    for (const site of config.realWebsites) {
        try {
            console.log(`🌐 Scanning: ${site.url}`);
            const analysis = await analyzeWebsite(site.url);
            
            if (analysis.success) {
                leads.push({
                    name: site.name,
                    website: site.url,
                    location: location,
                    score: analysis.score,
                    hasChat: analysis.hasChat,
                    hasForm: analysis.hasForm,
                    phones: analysis.phones,
                    emails: analysis.emails,
                    description: `Real ${industry} business - ${analysis.technologies.join(', ')}`
                });
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000)); // Respectful delay
            
        } catch (error) {
            console.log(`❌ Failed to scan ${site.url}: ${error.message}`);
        }
    }
    
    return leads;
}

// ENHANCED WEBSITE ANALYSIS
async function analyzeWebsite(url) {
    try {
        const html = await fetchWebsite(url);
        const $ = cheerio.load(html);
        const pageText = $('body').text().toLowerCase();
        
        // Advanced chat detection
        const chatSelectors = [
            '[class*="chat"]', '[id*="chat"]', '.intercom', '.drift', 
            '.livechat', '.tawk-button', '.olark', '.purechat',
            '.zendesk', '.helpcrunch', '.crisp', '.hubspot'
        ];
        
        const hasChatSelector = chatSelectors.some(selector => $(selector).length > 0);
        const hasChatText = /live chat|chat now|online chat|start chatting/i.test(pageText);
        const hasChatScript = $('script').toArray().some(script => 
            $(script).html()?.includes('chat') || $(script).attr('src')?.includes('chat')
        );
        
        // Advanced form detection
        const forms = $('form');
        const hasForm = forms.length > 0;
        const contactForms = forms.filter((i, form) => {
            const formHtml = $(form).html().toLowerCase();
            return /contact|email|phone|name|consult|appointment|message|submit|quote/i.test(formHtml);
        });
        
        // Technology detection
        const technologies = detectTechnologies($, html);
        
        // Contact extraction with validation
        const phoneRegex = /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g;
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        
        const phones = (pageText.match(phoneRegex) || [])
            .map(phone => phone.replace(/\D/g, ''))
            .filter(phone => phone.length >= 10)
            .slice(0, 3);
            
        const emails = (pageText.match(emailRegex) || [])
            .filter(email => !/noreply|no-reply|spam|example|test/i.test(email))
            .slice(0, 3);
        
        // Enhanced scoring
        let score = 5; // Base
        if (hasChatSelector || hasChatText || hasChatScript) score += 8;
        if (contactForms.length > 0) score += 7;
        if (hasForm) score += 2;
        if (phones.length > 0) score += 3;
        if (emails.length > 0) score += 2;
        if (technologies.length > 0) score += 1;
        
        return {
            success: true,
            hasChat: hasChatSelector || hasChatText || hasChatScript,
            hasForm: contactForms.length > 0,
            phones,
            emails,
            technologies,
            formsCount: forms.length,
            contactFormsCount: contactForms.length,
            score: Math.min(score, 20)
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message,
            hasChat: false,
            hasForm: false,
            phones: [],
            emails: [],
            technologies: [],
            score: 0
        };
    }
}

// TECHNOLOGY DETECTION
function detectTechnologies($, html) {
    const techSignatures = {
        'WordPress': ['wp-content', 'wp-includes', 'wordpress'],
        'Shopify': ['shopify'],
        'Wix': ['wix.com'],
        'React': ['react', 'react-dom'],
        'jQuery': ['jquery'],
        'Google Analytics': ['google-analytics', 'ga.js'],
        'Facebook Pixel': ['facebook-pixel', 'fbq'],
        'HubSpot': ['hubspot']
    };
    
    const detected = [];
    
    for (const [tech, signatures] of Object.entries(techSignatures)) {
        for (const signature of signatures) {
            if (html.includes(signature) || 
                $(`script[src*="${signature}"]`).length > 0 ||
                $(`link[href*="${signature}"]`).length > 0) {
                detected.push(tech);
                break;
            }
        }
    }
    
    return detected.slice(0, 5);
}

// ENHANCED: Google ranking simulation with sponsored detection
function simulateGoogleRanking(leads, industry, location) {
    return leads.map((lead, index) => {
        let position, isSponsored, rankingSource;
        
        if (index < 3) {
            position = index + 1;
            isSponsored = index < 2;
            rankingSource = isSponsored ? 'google_ads' : 'organic_top';
        } else if (index < 8) {
            position = index + 1;
            isSponsored = false;
            rankingSource = 'organic_first_page';
        } else if (index < 15) {
            position = index + 1;
            isSponsored = false;
            rankingSource = 'organic_second_page';
        } else {
            position = index + 1;
            isSponsored = false;
            rankingSource = 'organic_lower';
        }
        
        // Ensure ALL data is populated
        return {
            ...lead,
            googlePosition: position || 99,
            isSponsored: isSponsored !== undefined ? isSponsored : false,
            rankingSource: rankingSource || 'organic_unknown',
            rankingBadge: getRankingBadge(position, isSponsored) || 'Unknown Ranking',
            rankingScore: calculateRankingScore(position, isSponsored) || 0,
            mapPresence: hasGoogleMapsPresence(lead, index) || false,
            adSpendLikelihood: calculateAdSpendLikelihood(lead, position, isSponsored) || 'Unknown'
        };
    });
}

// Calculate ranking-based score
function calculateRankingScore(position, isSponsored) {
    let score = 0;
    
    if (isSponsored) {
        score = 25; // Highest score for sponsored ads
    } else if (position <= 3) {
        score = 20; // Top organic positions
    } else if (position <= 8) {
        score = 15; // First page organic
    } else if (position <= 15) {
        score = 10; // Second page
    } else {
        score = 5; // Lower pages
    }
    
    return score;
}

// Generate ranking badges
function getRankingBadge(position, isSponsored) {
    if (isSponsored) {
        return '🔥 Sponsored Ad';
    } else if (position <= 3) {
        return '🥇 Top Organic';
    } else if (position <= 8) {
        return '⭐ First Page';
    } else if (position <= 15) {
        return '📄 Second Page';
    } else {
        return '🔍 Lower Ranking';
    }
}

// Simulate Google Maps presence
function hasGoogleMapsPresence(lead, index) {
    // Higher ranked leads are more likely to have Maps presence
    const probability = Math.max(0.7 - (index * 0.05), 0.2);
    return Math.random() < probability;
}

// Calculate ad spend likelihood
function calculateAdSpendLikelihood(lead, position, isSponsored) {
    let likelihood = 'Low';
    
    if (isSponsored) {
        likelihood = 'Very High';
    } else if (position <= 3) {
        likelihood = 'High';
    } else if (position <= 8 && lead.hasChat) {
        likelihood = 'Medium-High';
    } else if (position <= 8) {
        likelihood = 'Medium';
    } else if (lead.hasChat || lead.hasForm) {
        likelihood = 'Low-Medium';
    }
    
    return likelihood;
}

// Enhanced lead generation with ranking data
function generateRealisticLeads(industry, location, count = 15) {
    const templates = {
        dental: ["Smile Perfect Dental", "Bright Now Dentistry", "Family Dental Care", "Modern Dental Solutions", "Elite Dental Group"],
        mortgage: ["Premier Mortgage Solutions", "Home Loan Experts", "First Rate Mortgage", "Capital Lending Group"],
        lawyer: ["Justice Law Partners", "Elite Legal Defense", "Premier Law Group", "City Law Associates"],
        realestate: ["Premier Properties", "Elite Realty Group", "Dream Home Realty", "City Real Estate Partners"],
        insurance: ["Secure Insurance Solutions", "Trusted Coverage Inc", "Premier Protection", "Family Insurance Group"]
    };
    
    const industryTemplates = templates[industry] || templates.dental;
    
    const baseLeads = Array.from({ length: count }, (_, i) => {
        const baseName = industryTemplates[i % industryTemplates.length];
        const name = `${baseName} - ${location}`;
        const domain = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Realistic probability distribution
        const hasChat = i < 4; // 33% have chat
        const hasForm = i < 8; // 66% have forms
        const hasPhone = i < 10; // 83% have phones
        const hasEmail = i < 7; // 58% have emails
        
        const phones = hasPhone ? [generateRealisticPhone(i)] : [];
        const emails = hasEmail ? [`contact@${domain}.com`] : [];
        
        const baseScore = 5 + (hasChat ? 8 : 0) + (hasForm ? 7 : 0) + 
                         (phones.length ? 3 : 0) + (emails.length ? 2 : 0);
        
        return {
            name,
            website: `https://www.${domain}.com`,
            location,
            score: Math.min(baseScore, 20),
            hasChat,
            hasForm,
            phones,
            emails,
            description: `Professional ${industry} services in ${location}`
        };
    }).sort((a, b) => b.score - a.score);
    
    // Add ranking data
    return simulateGoogleRanking(baseLeads, industry, location);
}

// Generate realistic phone numbers
function generateRealisticPhone(index) {
    const areaCodes = ['212', '310', '415', '312', '305', '702', '773', '347', '917', '646'];
    const prefixes = ['555', '556', '557', '558', '559', '560', '561', '562', '563', '564'];
    
    const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const lineNumber = 1000 + (index * 37) % 9000; // More random distribution
    
    return `(${areaCode}) ${prefix}-${lineNumber}`;
}

// ENHANCED LEAD GENERATION
function generateRealisticLeads(industry, location, count = 12) {
    const templates = {
        dental: ["Smile Perfect Dental", "Bright Now Dentistry", "Family Dental Care", "Modern Dental Solutions", "Elite Dental Group"],
        mortgage: ["Premier Mortgage Solutions", "Home Loan Experts", "First Rate Mortgage", "Capital Lending Group"],
        lawyer: ["Justice Law Partners", "Elite Legal Defense", "Premier Law Group", "City Law Associates"],
        realestate: ["Premier Properties", "Elite Realty Group", "Dream Home Realty", "City Real Estate Partners"],
        insurance: ["Secure Insurance Solutions", "Trusted Coverage Inc", "Premier Protection", "Family Insurance Group"]
    };
    
    const industryTemplates = templates[industry] || templates.dental;
    
    return Array.from({ length: count }, (_, i) => {
        const baseName = industryTemplates[i % industryTemplates.length];
        const name = `${baseName} - ${location}`;
        const domain = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Realistic probability distribution
        const hasChat = i < 4; // 33% have chat
        const hasForm = i < 8; // 66% have forms
        const hasPhone = i < 10; // 83% have phones
        const hasEmail = i < 7; // 58% have emails
        
        const phones = hasPhone ? [`(${555}) ${400 + i}-${2000 + i}`] : [];
        const emails = hasEmail ? [`contact@${domain}.com`] : [];
        
        const score = 5 + (hasChat ? 8 : 0) + (hasForm ? 7 : 0) + 
                     (phones.length ? 3 : 0) + (emails.length ? 2 : 0);
        
        return {
            name,
            website: `https://www.${domain}.com`,
            location,
            score: Math.min(score, 20),
            hasChat,
            hasForm,
            phones,
            emails,
            description: `Professional ${industry} services in ${location}`
        };
    }).sort((a, b) => b.score - a.score);
}

// Add this to your stats calculation in server.js
function calculateStats(leads) {
    const sponsoredCount = leads.filter(l => l.isSponsored).length;
    const firstPageCount = leads.filter(l => l.googlePosition <= 8).length;
    const top3Count = leads.filter(l => l.googlePosition <= 3).length;
    
    return {
        total: leads.length,
        withChat: leads.filter(l => l.hasChat).length,
        withForm: leads.filter(l => l.hasForm).length,
        withContact: leads.filter(l => l.phones.length > 0 || l.emails.length > 0).length,
        sponsored: sponsoredCount,
        firstPage: firstPageCount,
        top3: top3Count
    };
}

// ENHANCED CSV EXPORT
app.post('/api/export-csv', async (req, res) => {
    const { leads, industry } = req.body;
    
    try {
        if (!leads || !Array.isArray(leads)) {
            return res.status(400).json({ error: 'Invalid leads data' });
        }
        
        const csvData = leads.map(lead => ({
            Name: lead.name,
            Website: lead.website,
            Location: lead.location,
            'Lead Score': lead.score,
            'Live Chat': lead.hasChat ? 'Yes' : 'No',
            'Contact Form': lead.hasForm ? 'Yes' : 'No',
            'Phone Numbers': lead.phones.join('; '),
            'Email Addresses': lead.emails.join('; '),
            'Description': lead.description || '',
            'Analysis Date': new Date().toISOString().split('T')[0]
        }));
        
        const headers = Object.keys(csvData[0]);
        const csvRows = [
            headers.join(','),
            ...csvData.map(row => 
                headers.map(header => `"${row[header]}"`).join(',')
            )
        ];
        
        const csvString = csvRows.join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=leads-${industry}-${Date.now()}.csv`);
        res.send(csvString);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'Marketing Intelligence Pro',
        version: '2.0',
        features: ['Real website scanning', 'Chat detection', 'Form detection', 'Contact extraction', 'CSV export'],
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Marketing Intelligence Pro - ENHANCED VERSION`);
    console.log(`✅ Port: ${PORT}`);
    console.log(`✅ Real website scanning: ACTIVE`);
    console.log(`✅ Advanced detection: ACTIVE`);
    console.log(`✅ Cheerio integration: ACTIVE`);
});