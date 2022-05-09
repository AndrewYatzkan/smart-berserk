const DEBUG = false;
const IMG_SIZE = 253; // px
const C_ID = 'sbCanvas'; // canvas id
const MAX_RATING = 3200;
const MIN_RATING = 600;

function createCanvas() {
        window[C_ID] = new OffscreenCanvas(IMG_SIZE, IMG_SIZE);
        return window[C_ID];
}

async function drawImage(ctx, path) {
        let img = new Image();
        img.src = path;
        return new Promise((resolve, reject) => {
                img.onerror = () => reject();
                img.onload = () => {
                        ctx.drawImage(img, 0, 0);
                        img.style.display = 'none';
                        resolve();
                }
        });
}

// maps ratings to coordinates and returns that pixel
function getPixel(ctx, r1, r2) {
        let x = (r1 - MIN_RATING) / (MAX_RATING - MIN_RATING) * (IMG_SIZE - 1) | 0;
        let y = (r2 - MIN_RATING) / (MAX_RATING - MIN_RATING) * (IMG_SIZE - 1) | 0;
        return ctx.getImageData(x, y, 1, 1);
}

// returns true if the pixel is closer to being black than white
function isBlack(px) {
        let [r, g, b, a] = px.data;
        if (a === 0) return null; // pixel out of bounds
        return Math.sqrt(Math.pow(r, 2) + Math.pow(g, 2) + Math.pow(b, 2)) > Math.sqrt(195075) / 2;
}

async function shouldBerserk(tc='1+0', streak=0, side='w', opp='db', rating=1500, opp_rating=1500) {
        let c = window[C_ID] || createCanvas();
        let ctx = c.getContext('2d');

        streak = Math.min(streak, 2);
        let relativePath = `./img/${tc}_${Math.min(streak, 2)}s_${side}_${opp}.png`;
        let path = chrome.runtime.getURL(relativePath);
        await drawImage(ctx, path);

        let pixel = getPixel(ctx, rating, opp_rating)
        return isBlack(pixel); // should berserk if pixel is black
}

async function getStreak(tournamentId='7War3P3R', username='Andrew-9') {
        try {
                // not sure what partial=true does or if it's necessary
                let req = await fetch(`https://http.lichess.org/tournament/${tournamentId}?partial=true&me=${username}`);
                let res = await req.json();
                let { scores } = res.standing.players.filter(x => x.name.toLowerCase() === username.toLowerCase())[0].sheet;
                scores = ('00' + scores).split('').reverse();

                let streak = 0;
                if (scores[0] != '0') streak = 1;
                if (scores[1] != '0' && streak) streak = 2;
                return streak;
        } catch (e) {
                // either an argument is incorrect or the tournament is over
                return null;
        }
}

// player is 'w' or 'b'
function playerBerserked(player) {
        return !!document.querySelector(`div.rclock-${player === 'w' ? 'white' : 'black'} div.berserked`);
}

function gameInProgress() {
        return !!document.querySelector('div.bar');
}

function addBerserkCSS(berserk) {
        if (DEBUG) console.log(`Setting berserk CSS to ${berserk ? 'BERSERK' : 'DON\'T BERSERK'} ✅`);
        // ...
}

async function init() {
        if (DEBUG) console.log('Init called');

        let isLiveGameURL = (/^\/[a-z0-9]{8}$/i).test(window.location.pathname);
        if (!isLiveGameURL) return;
        if (DEBUG) console.log('Valid game url ✅');

        let canBerserk = !!document.querySelector('button.go-berserk');
        if (!canBerserk) return;
        if (DEBUG) console.log('Berserking is an option ✅');

        let tc = document.querySelector('div.setup')?.innerText?.split(' • ')[0];
        if (tc !== '1+0' && tc !== '3+0') return; // only 1+0 and 3+0 currently supported
        if (DEBUG) console.log('1+0 or 3+0 time control ✅');

        let username = document.querySelector('a#user_tag')?.innerText;
        let tournamentId = document.querySelector('section.game__tournament a')?.href?.split('/')?.slice(-1)[0];

        let streak = await getStreak(tournamentId, username);
        if (DEBUG) console.log(`Client username: ${username}\nTournament id: ${tournamentId}\nStreak: ${streak}`);

        // need to reverse to account for titled players (ex: ['GM', 'penguingim1', '(3000)'] vs ['Andrew-9', '(1800)'])
        let wInfo = document.querySelector('div.game__meta__players div.white').innerText.split(/\s/).reverse();
        let bInfo = document.querySelector('div.game__meta__players div.black').innerText.split(/\s/).reverse();
        let players = {
                w: {
                        username: wInfo[1],
                        rating: parseInt(wInfo[0].substr(1))
                },
                b: {
                        username: bInfo[1],
                        rating: parseInt(bInfo[0].substr(1))
                }
        };
        if (DEBUG) console.log('Players info:', players);

        let side = players.w.username === username ? 'w' : 'b';

        if (players[side].username !== username) return; // client isn't part of the game
        if (DEBUG) console.log(`Client is: ${side === 'w' ? 'WHITE' : 'BLACK'}`);

        let rating = players[side].rating;
        let opp_side = side === 'w' ? 'b' : 'w';
        let opp_rating = players[opp_side].rating;

        opp = playerBerserked(opp_side) ? 'b' : 'db';

        if (opp == 'db') {
                if (DEBUG) console.log('Opponent has yet to berserk. Starting interval.');
                let waitForBerserk = setInterval(async () => {
                        if (playerBerserked(opp_side)) {
                                if (DEBUG) console.log('Opponent has now berserked ✅');
                                clearInterval(waitForBerserk);
                                let berserk = await shouldBerserk(tc, streak, side, 'b', rating, opp_rating);
                                setBerserkCSS(berserk);
                        }
                        if (gameInProgress()) {
                                if (DEBUG) console.log('Game is now in progress ✅');
                                clearInterval(waitForBerserk);
                        }
                }, 100);
        }

        let berserk = await shouldBerserk(tc, streak, side, opp, rating, opp_rating);
        setBerserkCSS(berserk);
}

if (document.readyState !== 'loading') init();
else window.addEventListener('DOMContentLoaded', init);
