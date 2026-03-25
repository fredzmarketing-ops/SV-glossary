const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize Database
const dbPath = process.env.VERCEL ? '/tmp/database.sqlite' : path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database opening error: ', err);
    else {
        db.run(`CREATE TABLE IF NOT EXISTS glossary_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            term TEXT NOT NULL,
            type TEXT,
            definition TEXT,
            sge_snippet TEXT,
            faq JSON,
            eeat JSON,
            seo JSON,
            aka TEXT,
            related JSON,
            categories JSON,
            url TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

app.post('/api/generate', async (req, res) => {
    console.log('--- RECEIVED POST /api/generate ---', req.body.keywords);
    const { keywords, apiKey, s1, s2, s3, s4, s5, s6 } = req.body;
    
    if (!apiKey) return res.status(400).json({ error: 'Claude API Key is required' });
    if (!keywords || !keywords.length) return res.status(400).json({ error: 'Keywords are required' });

    const sys = `You are a senior healthcare compliance content strategist and SEO specialist writing glossary entries for StreamlineVerify.com — a leading OIG exclusion screening and healthcare compliance SaaS platform.

Your goal: write glossary entries that rank on Google, appear in SGE AI Overviews, and demonstrate full EEAT compliance per Google's Search Quality Evaluator Guidelines.

OUTPUT FORMAT: Respond ONLY with a valid raw JSON array. No markdown fences, no preamble, no trailing commentary.

Each object must contain:

"term": Exact keyword as provided.

"type": Exactly one of: ["Regulatory Database","Federal Program","Compliance Software","Compliance Process","Federal Agency","Legal Standard","Screening Tool","Healthcare Program","Government List","Risk Management Tool"]

"definition": 3-5 sentences. EEAT + SEO requirements:
- Sentence 1: Complete standalone definitional statement embedding the primary keyword. This sentence alone must answer "What is [term]?"
- Include the governing federal agency, law, or regulation (OIG under HHS, 42 U.S.C. section 1320a-7, CMS, OFAC under U.S. Treasury, SAM.gov under FAR Part 9)
- Explain real-world consequence or obligation for healthcare organizations or providers
- Use precise compliance-industry language; avoid vague generalities
- Tone: authoritative, factual, neutral — never promotional

"url": "Format this as 'glossary/[term-slug]/'. E.g., for 'OIG Exclusion List', the URL would be 'glossary/oig-exclusion-list/'"

"categories": "Array of exactly 3-5 question-like strings. Each string MUST be phrased as a question targeting user intent. E.g., 'What are the compliance risks for [term]?', 'How often must [term] be reviewed?', 'Who is required to check [term]?'"

${s1 ? `"sge_snippet": "40-60 words. Engineered for Google SGE AI Overviews. Must: begin with the term itself, completely answer 'What is [term]?' as standalone, define term plus regulatory context plus practical significance, spell out any acronym."` : `"sge_snippet":""`}

${s2 ? `"faq": "Array of exactly 2 objects with 'q' and 'a' keys. Optimized for People Also Ask and voice search. Questions use natural phrasing (Who must, What happens if, How often should, Why is, What is the difference between). Answers: 2-3 sentences, conversational but precise, self-contained. Vary types: one practical/operational, one regulatory/consequence-focused."` : `"faq":[]`}

${s3 ? `"eeat": "Object with exactly 4 string keys:\n'experience': Practical real-world application a compliance officer recognizes from direct experience.\n'expertise': Technical depth citing specific statute, CFR section, or agency rule.\n'authority': Connection to recognized federal bodies or official databases.\n'trust': Why this definition is reliable, verifiable, and consistent with official government guidance."` : `"eeat":null`}

${s4 ? `"seo": "Object with:\n'title_tag': 50-60 characters. Format: '[Primary Keyword]: Definition and Guide | StreamlineVerify'. Must contain exact keyword.\n'meta_description': 145-158 characters. Start with strong verb (Learn, Discover, Understand). Include primary keyword in first 20 words. End with soft CTA.\n'keywords': Array of exactly 6 LSI keyword phrases — mix of long-tail variants, regulatory terms, action phrases, co-occurring compliance concepts. No duplicates of main term."` : `"seo":null`}

${s5 ? `"aka": "Abbreviation(s) or alternate name(s) as single string. Empty string if none."` : `"aka":""`}

${s6 ? `"related": "Array of exactly 5 related glossary term strings for internal linking and topical authority clustering."` : `"related":[]`}

EEAT QUALITY CHECKLIST — every entry must pass:
- Definition sentence 1 is a complete, standalone, citable answer
- Regulatory/statutory references are accurate and specific
- SGE snippet is 40-60 words and fully self-contained
- FAQ questions target real PAA-style search intent
- EEAT signals reference named federal sources
- SEO title is 50-60 chars with exact keyword
- Meta description is 145-158 chars with verb-first opening
- Categories are formatted as user intent questions
- URL follows glossary/[term-slug]/ format`;

    const um = `Generate EEAT- and SGE-optimized glossary entries for StreamlineVerify.com for these healthcare compliance terms:\n\n${keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}`;

    const modelsToTry = [
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
        'claude-sonnet-4-5',
        'claude-3-7-sonnet-latest',
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-latest',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-latest',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-latest',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
    ];

    let response = null;
    let lastError = null;

    for (const model of modelsToTry) {
        try {
            response = await axios.post('https://api.anthropic.com/v1/messages', {
                model: model,
                max_tokens: 4000,
                system: sys,
                messages: [{ role: 'user', content: um }]
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                }
            });
            console.log(`Successfully generated using ${model}`);
            break; // Success
        } catch (err) {
            lastError = err;
            const errMsg = err.response?.data?.error?.message || '';
            const errType = err.response?.data?.error?.type || '';
            if (err.response?.status === 404 || err.response?.status === 400 && (errMsg.includes('model') || errType === 'not_found_error')) {
                console.log(`Model ${model} not available (${err.response.status}), type: ${errType}, err: ${errMsg}. Trying next...`);
                continue;
            } else {
                console.log(`Failed with ${model}:`, errMsg);
                // If it's an auth error (401) or rate limit (429), stop immediately
                break;
            }
        }
    }

    if (!response) {
        console.error('All models failed or an unrecoverable error occurred.');
        const errorMsg = lastError?.response?.data?.error?.message || lastError?.message || 'Failed after trying all models';
        return res.status(500).json({ error: errorMsg, details: lastError?.response?.data });
    }

    try {
        const raw = response.data.content.map(b => b.text || '').join('');
        const clean = raw.replace(/\`\`\`json|\`\`\`/g, '').trim();
        const arr = JSON.parse(clean);

        // Save to DB
        const stmt = db.prepare(`INSERT OR IGNORE INTO glossary_entries (term, type, definition, sge_snippet, faq, eeat, seo, aka, related, categories, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        arr.forEach(e => {
            stmt.run([
                e.term,
                e.type || '',
                e.definition,
                e.sge_snippet || '',
                JSON.stringify(e.faq || []),
                JSON.stringify(e.eeat || null),
                JSON.stringify(e.seo || null),
                e.aka || '',
                JSON.stringify(e.related || []),
                JSON.stringify(e.categories || []),
                e.url || `glossary/${e.term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`
            ]);
        });
        stmt.finalize();

        res.json(arr);
    } catch (parseErr) {
        console.error('Failed to parse generation:', parseErr);
        res.status(500).json({ error: 'Failed to process AI response into JSON', details: parseErr.message });
    }
});

app.get('/api/entries', (req, res) => {
    db.all(`SELECT * FROM glossary_entries ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else {
            const parsedRows = rows.map(r => ({
                ...r,
                faq: JSON.parse(r.faq || '[]'),
                eeat: JSON.parse(r.eeat || 'null'),
                seo: JSON.parse(r.seo || 'null'),
                related: JSON.parse(r.related || '[]'),
                categories: JSON.parse(r.categories || '[]')
            }));
            res.json(parsedRows);
        }
    });
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });

    // Force event loop to stay open indefinitely 
    setInterval(() => {}, 1000 * 60 * 60 * 24);
}

module.exports = app;
