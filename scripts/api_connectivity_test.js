import { spawn } from 'node:child_process';

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function startLocalServer(port) {
    const child = spawn(process.execPath, ['server.js'], {
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
        const message = chunk.toString().trim();
        if (message) {
            console.log(`[local-server] ${message}`);
        }
    });

    child.stderr.on('data', (chunk) => {
        const message = chunk.toString().trim();
        if (message) {
            console.error(`[local-server] ${message}`);
        }
    });

    return child;
}

async function testPublicApis() {
    console.log('--- API Connectivity Test (Public Endpoints) ---');

    // 1. Test Upbit BTC/KRW + USDT/KRW
    try {
        const upbitRes = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-USDT');
        const upbitData = await upbitRes.json();
        const byMarket = new Map(upbitData.map((item) => [item.market, item.trade_price]));
        console.log('✅ Upbit 연결 성공!');
        console.log(`   - BTC/KRW 시세: ${Number(byMarket.get('KRW-BTC')).toLocaleString()} KRW`);
        console.log(`   - USDT/KRW 시세: ${Number(byMarket.get('KRW-USDT')).toLocaleString()} KRW`);
    } catch (error) {
        console.error('❌ Upbit 연결 실패:', error.message);
    }

    // 2. Test Binance
    try {
        const binanceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const binanceData = await binanceRes.json();
        console.log('✅ Binance 연결 성공!');
        console.log(`   - BTC/USDT 시세: ${Number(binanceData.price).toLocaleString()} USDT`);
    } catch (error) {
        console.error('❌ Binance 연결 실패:', error.message);
    }

    // 3. Test Bybit
    try {
        const bybitRes = await fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT');
        const bybitData = await bybitRes.json();
        const bybitPrice = Number(bybitData?.result?.list?.[0]?.lastPrice);
        console.log('✅ Bybit 연결 성공!');
        console.log(`   - BTC/USDT 시세: ${bybitPrice.toLocaleString()} USDT`);
    } catch (error) {
        console.error('❌ Bybit 연결 실패:', error.message);
    }

    // 4. Test USD/KRW FX
    try {
        const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
        const fxData = await fxRes.json();
        console.log('✅ 환율 API 연결 성공!');
        console.log(`   - USD/KRW 환율: ${Number(fxData?.rates?.KRW).toLocaleString()}`);
    } catch (error) {
        console.error('❌ 환율 API 연결 실패:', error.message);
    }
}

async function testLocalPremiumApi() {
    console.log('--- Local Premium Candle API Test ---');

    const testPort = 4109;
    const serverProcess = startLocalServer(testPort);
    await wait(2500);

    try {
        const intervals = ['1m', '10m', '30m', '1d'];
        for (const interval of intervals) {
            const res = await fetch(`http://localhost:${testPort}/api/premium-candles?interval=${interval}&limit=5`);
            if (!res.ok) {
                throw new Error(`${interval} HTTP ${res.status}`);
            }

            const data = await res.json();
            const candles = Array.isArray(data?.candles) ? data.candles : [];
            const last = candles.length ? candles[candles.length - 1] : null;

            console.log(`✅ 로컬 ${interval}봉 API 성공!`);
            console.log(`   - 수신 봉 수: ${candles.length}`);
            console.log(`   - 글로벌 소스: ${data?.sources?.global ?? 'unknown'}`);
            if (last) {
                console.log(`   - 최근 봉 O/H/L/C: ${Number(last.open).toFixed(2)} / ${Number(last.high).toFixed(2)} / ${Number(last.low).toFixed(2)} / ${Number(last.close).toFixed(2)}%`);
            }
        }

        const fundingRes = await fetch(`http://localhost:${testPort}/api/top-volume-funding?limit=10&side=SHORT&notionalUsdt=1000&fundingIntervalHours=8`);
        if (!fundingRes.ok) {
            throw new Error(`top-volume-funding HTTP ${fundingRes.status}`);
        }
        const fundingData = await fundingRes.json();
        const topRows = Array.isArray(fundingData?.symbols) ? fundingData.symbols : [];
        const first = topRows[0];
        console.log('✅ 로컬 상위거래량/펀딩 API 성공!');
        console.log(`   - 수신 종목 수: ${topRows.length}`);
        console.log(`   - 소스: ${fundingData?.source ?? 'unknown'}`);
        if (first) {
            console.log(`   - 1위 ${first.symbol} 펀딩비: ${(Number(first.fundingRate) * 100).toFixed(4)}%`);
            console.log(`   - 1위 예상 펀딩손익(USDT): ${Number(first.estimatedFundingFeeUsdt).toFixed(4)}`);
        }
    } catch (error) {
        console.error('❌ 로컬 API 테스트 실패:', error.message);
    } finally {
        serverProcess.kill();
    }
}

async function main() {
    await testPublicApis();
    await testLocalPremiumApi();
    console.log('--- 테스트 종료 ---');
}

main();
