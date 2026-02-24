import { spawn } from 'node:child_process';

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function startLocalServer(port) {
    const child = spawn(process.execPath, ['server.js'], {
        env: { ...process.env, PORT: String(port), EXECUTION_ADMIN_TOKEN: '' },
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

        const multiRes = await fetch(`http://localhost:${testPort}/api/multi-premium?limit=5`);
        if (!multiRes.ok) {
            throw new Error(`multi-premium HTTP ${multiRes.status}`);
        }
        const multiData = await multiRes.json();
        const multiRows = Array.isArray(multiData?.coins) ? multiData.coins : [];
        console.log('✅ 로컬 멀티코인 김프 API 성공!');
        console.log(`   - 수신 코인 수: ${multiRows.length}`);
        console.log(`   - 글로벌 소스: ${multiData?.globalSource ?? 'unknown'}`);
        if (multiRows[0]) {
            console.log(`   - 1위 ${multiRows[0].symbol} USD 김프: ${Number(multiRows[0].premiumUsd).toFixed(2)}%`);
        }

        const backtestRes = await fetch(
            `http://localhost:${testPort}/api/backtest/premium?interval=1m&limit=200&premiumBasis=USDT&entryThreshold=0.1&exitThreshold=0.0&leverage=1&initialCapitalKrw=10000000&feeBps=6&slippageBps=2&forceCloseAtEnd=true`
        );
        if (!backtestRes.ok) {
            throw new Error(`backtest HTTP ${backtestRes.status}`);
        }
        const backtestData = await backtestRes.json();
        console.log('✅ 로컬 백테스트 API 성공!');
        console.log(`   - 거래 수: ${Number(backtestData?.tradeCount ?? 0)}회`);
        console.log(`   - 총 수익률: ${Number(backtestData?.totalReturnPct ?? 0).toFixed(2)}%`);
        console.log(`   - 총 손익: ${Number(backtestData?.totalProfitKrw ?? 0).toLocaleString()} KRW`);

        const historyRes = await fetch(`http://localhost:${testPort}/api/backtest/premium/history?interval=1m`);
        if (!historyRes.ok) {
            throw new Error(`backtest history HTTP ${historyRes.status}`);
        }
        const historyData = await historyRes.json();
        const coverage = historyData?.coverage ?? {};
        console.log('✅ 로컬 백테스트 히스토리 상태 API 성공!');
        console.log(`   - 저장 봉 수: ${Number(coverage?.storedCandles ?? 0)}개`);
        console.log(`   - 저장 구간: ${coverage?.earliestTimestamp ?? '-'} ~ ${coverage?.latestTimestamp ?? '-'}`);

        const latestTs = Number(coverage?.latestTimestamp ?? 0);
        const earliestTs = Number(coverage?.earliestTimestamp ?? 0);
        if (latestTs > 0 && earliestTs > 0 && latestTs >= earliestTs) {
            const rangeStartTs = Math.max(earliestTs, latestTs - 24 * 60 * 60 * 1000);
            const rangeBacktestRes = await fetch(
                `http://localhost:${testPort}/api/backtest/premium?interval=1m&limit=200&premiumBasis=USDT&entryThreshold=0.1&exitThreshold=0.0&leverage=1&initialCapitalKrw=10000000&feeBps=6&slippageBps=2&forceCloseAtEnd=true&useStoredData=true&startTime=${rangeStartTs}&endTime=${latestTs}`
            );
            if (!rangeBacktestRes.ok) {
                throw new Error(`range backtest HTTP ${rangeBacktestRes.status}`);
            }
            const rangeBacktestData = await rangeBacktestRes.json();
            console.log('✅ 로컬 기간 백테스트 API 성공!');
            console.log(`   - 사용 데이터 소스: ${rangeBacktestData?.dataSource ?? 'unknown'}`);
            console.log(`   - 사용 봉 수: ${Number(rangeBacktestData?.candleCount ?? 0)}개`);

            const usdBasisRes = await fetch(
                `http://localhost:${testPort}/api/backtest/premium?interval=1m&limit=200&premiumBasis=USD&entryThreshold=2.5&exitThreshold=2.3&leverage=1&initialCapitalKrw=10000000&feeBps=6&slippageBps=2&forceCloseAtEnd=true&useStoredData=true&startTime=${rangeStartTs}&endTime=${latestTs}`
            );
            if (!usdBasisRes.ok) {
                throw new Error(`usd basis backtest HTTP ${usdBasisRes.status}`);
            }
            const usdBasisData = await usdBasisRes.json();
            console.log('✅ 로컬 USD 기준 백테스트 API 성공!');
            console.log(`   - USD 기준 거래 수: ${Number(usdBasisData?.tradeCount ?? 0)}회`);
            console.log(`   - 적용 USD/KRW: ${Number(usdBasisData?.usdKrwRateApplied ?? 0).toFixed(4)}`);
            if (usdBasisData?.usdKrwHistoryCoverage) {
                console.log(`   - 환율 히스토리 일수: ${Number(usdBasisData.usdKrwHistoryCoverage.dayCount)}일`);
                console.log(`   - 환율 히스토리 소스: ${usdBasisData.usdKrwHistoryCoverage.source}`);
            }
        }

        const logRes = await fetch(`http://localhost:${testPort}/api/data-load-events?limit=5`);
        if (!logRes.ok) {
            throw new Error(`data-load-events HTTP ${logRes.status}`);
        }
        const logData = await logRes.json();
        const events = Array.isArray(logData?.events) ? logData.events : [];
        console.log('✅ 로컬 데이터 로드 로그 API 성공!');
        console.log(`   - 최근 이벤트 수: ${events.length}`);
        if (events[0]) {
            console.log(`   - 최신 이벤트: ${events[0].event} (${events[0].level})`);
        }

        const executionStatusRes = await fetch(
            `http://localhost:${testPort}/api/execution/binance/status?marketType=coinm`
        );
        let executionStatusData = null;
        if (executionStatusRes.ok) {
            executionStatusData = await executionStatusRes.json();
            console.log('✅ 로컬 바이낸스 실행 연결 상태 API 성공!');
            console.log(`   - 설정 여부: ${executionStatusData?.configured ? 'configured' : 'not-configured'}`);
            console.log(`   - 시장/테스트넷: ${executionStatusData?.marketType ?? '-'} / ${executionStatusData?.testnet ?? '-'}`);
        } else {
            let statusText = '';
            try {
                statusText = (await executionStatusRes.text()).slice(0, 200);
            } catch {
                statusText = '';
            }
            console.warn(`⚠️ 로컬 바이낸스 실행 연결 상태 API 경고: HTTP ${executionStatusRes.status}`);
            if (statusText) {
                console.warn(`   - 응답: ${statusText}`);
            }
            executionStatusData = {
                configured: false,
                marketType: 'coinm',
                testnet: null,
            };
        }

        const safetyRes = await fetch(`http://localhost:${testPort}/api/execution/safety`);
        if (!safetyRes.ok) {
            throw new Error(`execution safety HTTP ${safetyRes.status}`);
        }
        const safetyData = await safetyRes.json();
        console.log('✅ 로컬 실행 안전상태 API 성공!');
        console.log(`   - safeMode: ${safetyData?.safety?.safeMode ? 'ON' : 'OFF'}`);
        console.log(`   - 연속 실패: ${Number(safetyData?.safety?.consecutiveFailures ?? 0)}`);

        const dryRunIdempotencyKey = `local-dry-run-${Date.now()}`;
        const orderDryRunRes = await fetch(`http://localhost:${testPort}/api/execution/binance/order`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'idempotency-key': dryRunIdempotencyKey,
            },
            body: JSON.stringify({
                marketType: 'coinm',
                side: 'sell',
                type: 'market',
                amount: 1,
                dryRun: true,
            }),
        });
        if (!orderDryRunRes.ok) {
            throw new Error(`execution dry-run order HTTP ${orderDryRunRes.status}`);
        }
        const orderDryRunData = await orderDryRunRes.json();
        console.log('✅ 로컬 바이낸스 주문(드라이런) API 성공!');
        console.log(`   - 주문ID: ${orderDryRunData?.order?.id ?? '-'}`);
        console.log(`   - side/type: ${orderDryRunData?.request?.side ?? '-'} / ${orderDryRunData?.request?.type ?? '-'}`);

        const orderReplayRes = await fetch(`http://localhost:${testPort}/api/execution/binance/order`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'idempotency-key': dryRunIdempotencyKey,
            },
            body: JSON.stringify({
                marketType: 'coinm',
                side: 'sell',
                type: 'market',
                amount: 1,
                dryRun: true,
            }),
        });
        if (!orderReplayRes.ok) {
            throw new Error(`execution dry-run replay HTTP ${orderReplayRes.status}`);
        }
        const replayHeader = orderReplayRes.headers.get('x-idempotency-replay');
        console.log('✅ 로컬 바이낸스 주문 아이템포턴시 재생 확인!');
        console.log(`   - replay 헤더: ${replayHeader ?? 'missing'}`);

        const executionEventsRes = await fetch(
            `http://localhost:${testPort}/api/execution/events?limit=5`
        );
        if (!executionEventsRes.ok) {
            throw new Error(`execution events HTTP ${executionEventsRes.status}`);
        }
        const executionEventsData = await executionEventsRes.json();
        const executionEvents = Array.isArray(executionEventsData?.events) ? executionEventsData.events : [];
        console.log('✅ 로컬 실행 이벤트 로그 API 성공!');
        console.log(`   - 최근 실행 이벤트 수: ${executionEvents.length}`);
        if (executionEvents[0]) {
            console.log(`   - 최신 실행 이벤트: ${executionEvents[0].event} (${executionEvents[0].level})`);
        }

        const engineStatusRes = await fetch(
            `http://localhost:${testPort}/api/execution/engine/status`
        );
        if (!engineStatusRes.ok) {
            throw new Error(`execution engine status HTTP ${engineStatusRes.status}`);
        }
        const engineStatusData = await engineStatusRes.json();
        console.log('✅ 로컬 실행 엔진 상태 API 성공!');
        console.log(`   - running: ${engineStatusData?.engine?.running ? 'ON' : 'OFF'}`);

        const readinessRes = await fetch(
            `http://localhost:${testPort}/api/execution/engine/readiness?mode=dryrun&marketType=coinm&symbol=BTC%2FUSD%3ABTC`
        );
        if (!readinessRes.ok) {
            throw new Error(`execution engine readiness HTTP ${readinessRes.status}`);
        }
        const readinessData = await readinessRes.json();
        console.log('✅ 로컬 실행 엔진 준비도 API 성공!');
        console.log(`   - ready: ${readinessData?.ready ? 'YES' : 'NO'}`);

        const engineStartRes = await fetch(`http://localhost:${testPort}/api/execution/engine/start`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                marketType: 'coinm',
                symbol: 'BTC/USD:BTC',
                amount: 1,
                dryRun: true,
                premiumBasis: 'USD',
                entryThreshold: 2.0,
                exitThreshold: 0.0,
            }),
        });
        if (!engineStartRes.ok) {
            throw new Error(`execution engine start HTTP ${engineStartRes.status}`);
        }
        const engineStartData = await engineStartRes.json();
        console.log('✅ 로컬 실행 엔진 시작 API 성공!');
        console.log(`   - running: ${engineStartData?.engine?.running ? 'ON' : 'OFF'}`);

        await wait(1500);

        const engineStopRes = await fetch(`http://localhost:${testPort}/api/execution/engine/stop`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                reason: 'api-connectivity-test-stop',
            }),
        });
        if (!engineStopRes.ok) {
            throw new Error(`execution engine stop HTTP ${engineStopRes.status}`);
        }
        const engineStopData = await engineStopRes.json();
        console.log('✅ 로컬 실행 엔진 정지 API 성공!');
        console.log(`   - running: ${engineStopData?.engine?.running ? 'ON' : 'OFF'}`);

        if (executionStatusData?.configured) {
            const fillsRes = await fetch(
                `http://localhost:${testPort}/api/execution/binance/fills?marketType=${encodeURIComponent(
                    executionStatusData?.marketType ?? 'coinm'
                )}&limit=5`
            );

            if (!fillsRes.ok) {
                throw new Error(`execution fills HTTP ${fillsRes.status}`);
            }

            const fillsData = await fillsRes.json();
            const fills = Array.isArray(fillsData?.fills) ? fillsData.fills : [];
            console.log('✅ 로컬 바이낸스 체결 내역 API 성공!');
            console.log(`   - 최근 체결 수: ${fills.length}`);
            if (fills[0]) {
                console.log(
                    `   - 최신 체결: ${fills[0].side ?? '-'} ${fills[0].amount ?? '-'} @ ${fills[0].price ?? '-'}`
                );
            }
        }

        const resetSafetyRes = await fetch(`http://localhost:${testPort}/api/execution/safety/reset`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                reason: 'api-connectivity-test',
            }),
        });
        if (!resetSafetyRes.ok) {
            throw new Error(`execution safety reset HTTP ${resetSafetyRes.status}`);
        }
        const resetSafetyData = await resetSafetyRes.json();
        console.log('✅ 로컬 실행 안전모드 리셋 API 성공!');
        console.log(`   - 리셋 후 safeMode: ${resetSafetyData?.safety?.safeMode ? 'ON' : 'OFF'}`);
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
