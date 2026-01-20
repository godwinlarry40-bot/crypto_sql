// Alternative free API (no key required) - using CoinGecko as backup
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false';

$(document).ready(function() {
    // DOM Elements using jQuery selectors
    const $marketDataTbody = $('#marketData');
    const $apiStatus = $('#apiStatus');
    const $lastUpdate = $('#lastUpdate');
    const $debugDetails = $('#debugDetails');
    const $sidebar = $('#sidebar');
    const $hamburgerBtn = $('#hamburgerBtn');
    const $sidebarOverlay = $('#sidebarOverlay');

    // Area of change: jQuery Global AJAX Setup for consistent Authorization headers
    $.ajaxSetup({
        beforeSend: function(xhr) {
            const token = localStorage.getItem('token');
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
        }
    });

    // --- SIDEBAR FUNCTIONALITY (Fixed hamburger button) ---
    function initSidebar() {
        if ($hamburgerBtn.length) {
            $hamburgerBtn.on('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                $sidebar.toggleClass('active');
                if ($sidebarOverlay.length) {
                    $sidebarOverlay.toggleClass('active');
                }
            });
        }

        if ($sidebarOverlay.length) {
            $sidebarOverlay.on('click', function() {
                $sidebar.removeClass('active');
                $(this).removeClass('active');
            });
        }

        // Handle dropdown menus in sidebar
        $('.dropbtn').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).next('.dropdown-menu').slideToggle();
        });
    }

    // --- SIGN OUT FUNCTIONALITY ---
    function initSignOut() {
        // Handle header logout button
        $('#headerLogoutBtn').on('click', function(e) {
            e.preventDefault();
            performSignOut();
        });
        
        // Handle sidebar logout button
        $('#sidebarLogoutBtn').on('click', function(e) {
            e.preventDefault();
            performSignOut();
        });
        
        function performSignOut() {
            // Clear authentication data
            localStorage.removeItem('token');
            localStorage.removeItem('userData');
            
            // Show confirmation message
            if (confirm('Are you sure you want to sign out?')) {
                // Redirect to login page
                window.location.href = '/login';
            }
        }
    }

    // --- CRYPTO MARKET DATA LOGIC ---
    async function fetchCryptoData() {
        let debugLog = [];
        
        try {
            updateApiStatus('loading', 'Fetching data via secure server proxy...');
            debugLog.push('Requesting data from local proxy...');
            
            // Tier 1: Secure Internal Proxy (CoinMarketCap) via jQuery
            const cmcData = await $.ajax({
                url: '/api/proxy/cmc',
                method: 'GET',
                dataType: 'json'
            });

            if (cmcData.status && cmcData.status.error_code === 0) {
                updateApiStatus('connected', 'Live data secured via TradePro Server');
                displayMarketData(cmcData.data, 'CoinMarketCap (Proxy)');
                debugLog.push('Data successfully processed from Proxy');
                updateDebugInfo(debugLog);
                return;
            } else {
                debugLog.push(`Proxy API error: ${cmcData.status ? cmcData.status.error_message : 'Unknown error'}`);
            }
        } catch (cmcError) {
            debugLog.push(`Proxy fetch error: ${cmcError.statusText || cmcError.message}`);
        }

        // Tier 2: CoinGecko Fallback via jQuery
        try {
            updateApiStatus('loading', 'Trying CoinGecko API...');
            debugLog.push('Trying CoinGecko API as fallback...');
            
            const geckoData = await $.ajax({
                url: COINGECKO_API_URL,
                method: 'GET',
                dataType: 'json'
            });

            updateApiStatus('connected', 'Live data from CoinGecko');
            displayMarketDataFromGecko(geckoData);
            debugLog.push('Data successfully processed from CoinGecko');
            updateDebugInfo(debugLog);
            return;
        } catch (geckoError) {
            debugLog.push(`CoinGecko error: ${geckoError.statusText || geckoError.message}`);
        }

        // Tier 3: Offline Fallback
        debugLog.push('All APIs failed, using fallback data');
        updateApiStatus('disconnected', 'Using offline fallback data');
        displayFallbackData();
        updateDebugInfo(debugLog);
    }

    function displayMarketData(cryptoData, source) {
        if (!$marketDataTbody.length) return; 
        $marketDataTbody.empty();

        cryptoData.forEach(crypto => {
            const price = crypto.quote.USD.price;
            const change = crypto.quote.USD.percent_change_24h;
            const row = `
                <tr>
                    <td><strong>${crypto.symbol}</strong> / USD</td>
                    <td>$${formatPrice(price)}</td>
                    <td class="${change >= 0 ? 'green' : 'red'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</td>
                    <td>$${formatMarketCap(crypto.quote.USD.market_cap)}</td>
                    <td>${new Date(crypto.quote.USD.last_updated).toLocaleTimeString()} (${source})</td>
                </tr>
            `;
            $marketDataTbody.append(row);
        });
        if($lastUpdate.length) $lastUpdate.text(`Last updated: ${new Date().toLocaleTimeString()}`);
    }

    function displayMarketDataFromGecko(cryptoData) {
        if (!$marketDataTbody.length) return;
        $marketDataTbody.empty();

        cryptoData.forEach(crypto => {
            const row = `
                <tr>
                    <td><strong>${crypto.symbol.toUpperCase()}</strong> / USD</td>
                    <td>$${formatPrice(crypto.current_price)}</td>
                    <td class="${crypto.price_change_percentage_24h >= 0 ? 'green' : 'red'}">
                        ${crypto.price_change_percentage_24h >= 0 ? '+' : ''}${crypto.price_change_percentage_24h?.toFixed(2) || '0.00'}%
                    </td>
                    <td>$${formatMarketCap(crypto.market_cap)}</td>
                    <td>${new Date(crypto.last_updated).toLocaleTimeString()} (CoinGecko)</td>
                </tr>
            `;
            $marketDataTbody.append(row);
        });
    }

    function displayFallbackData() {
        if (!$marketDataTbody.length) return;
        $marketDataTbody.empty();
        const fallbackData = [
            { symbol: 'BTC', price: 52345.67, change24h: 2.34, marketCap: 1023456789012 },
            { symbol: 'ETH', price: 2845.23, change24h: -1.23, marketCap: 341234567890 }
        ];
        fallbackData.forEach(crypto => {
            const row = `
                <tr>
                    <td><strong>${crypto.symbol}</strong> / USD</td>
                    <td>$${formatPrice(crypto.price)}</td>
                    <td class="${crypto.change24h >= 0 ? 'green' : 'red'}">${crypto.change24h >= 0 ? '+' : ''}${crypto.change24h}%</td>
                    <td>$${formatMarketCap(crypto.marketCap)}</td>
                    <td>Offline Data</td>
                </tr>
            `;
            $marketDataTbody.append(row);
        });
    }

    // --- USER DASHBOARD DATA LOGIC ---
    async function loadDashboardData() {
        if (!$('#total-balance').length) return;

        try {
            const userData = await $.ajax({
                url: '/api/user/dashboard-data',
                method: 'GET',
                dataType: 'json'
            });
            updateUI(userData);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        }
    }

    function updateUI(data) {
        $('#nav-username').text(data.fullName);
        $('.welcome-msg h1').text(`Welcome ${data.fullName}!`);
        $('.stat-card:eq(0) .value').text(`$${data.balance.toLocaleString()}`);
        $('.stat-card:eq(1) .value').text(`$${data.investments.toLocaleString()}`);
        $('.stat-card:eq(2) .value').text(`+$${data.profit.toLocaleString()}`);

        const $tableBody = $('.activity-table tbody');
        if ($tableBody.length) {
            $tableBody.empty(); 
            data.transactions.forEach(tx => {
                const row = `
                    <tr>
                        <td>${tx.date}</td>
                        <td>${tx.type}</td>
                        <td>${tx.amount}</td>
                        <td class="${tx.status.toLowerCase() === 'completed' ? 'status-completed' : 'status-pending'}">
                            ${tx.status}
                        </td>
                    </tr>
                `;
                $tableBody.append(row);
            });
        }
    }

    function formatPrice(price) {
        if (!price) return '0.00';
        return price >= 1 ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : price.toLocaleString('en-US', { maximumFractionDigits: 6 });
    }

    function formatMarketCap(marketCap) {
        if (!marketCap) return '0';
        if (marketCap >= 1e12) return (marketCap / 1e12).toFixed(2) + 'T';
        if (marketCap >= 1e9) return (marketCap / 1e9).toFixed(2) + 'B';
        return (marketCap / 1e6).toFixed(2) + 'M';
    }

    function updateApiStatus(status, message) {
        if (!$apiStatus.length) return;
        $apiStatus.attr('class', `api-status ${status}`);
        $apiStatus.html(status === 'loading' ? `<span class="loading-spinner"></span> ${message}` : message);
    }

    function updateDebugInfo(log) {
        if ($debugDetails.length) $debugDetails.html(log.map(entry => `<div>${entry}</div>`).join(''));
    }

    // Run Initializers
    initSidebar();
    initSignOut(); // Added sign-out initialization
    loadDashboardData();
    if ($marketDataTbody.length) {
        fetchCryptoData();
        setInterval(fetchCryptoData, 30000);
    }
});