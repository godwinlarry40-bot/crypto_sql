// Area of change: Secure internal proxy is prioritized
const PROXY_API_URL = '/api/proxy/cmc'; 
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false';

let cryptoData = [];
let autoRefreshInterval;

// Area of change: Used jQuery $(document).ready()
$(document).ready(function() {
    fetchCryptoData();
    setupFilters();
    setupRefreshButton();
    
    // Auto-refresh every 2 minutes
    autoRefreshInterval = setInterval(fetchCryptoData, 120000);
});

// Area of change: Fetch logic refactored to $.ajax() with fallback
async function fetchCryptoData() {
    const $tableBody = $('#cryptoTableBody');
    $tableBody.html(`<tr><td colspan="7" class="loading"><i class="fas fa-spinner fa-spin"></i> Loading via Secure Proxy...</td></tr>`);

    $.ajax({
        url: PROXY_API_URL,
        method: 'GET',
        dataType: 'json',
        success: function(result) {
            if (result && result.data && Array.isArray(result.data)) {
                cryptoData = result.data.map((coin) => ({
                    id: coin.id,
                    symbol: coin.symbol.toUpperCase(),
                    name: coin.name,
                    price: coin.quote.USD.price,
                    change: coin.quote.USD.percent_change_24h || 0,
                    marketCap: coin.quote.USD.market_cap || 0,
                    volume: coin.quote.USD.volume_24h || 0,
                    lastUpdated: coin.last_updated,
                    source: 'CMC Secure'
                }));
                renderUI();
            } else {
                fetchCoinGeckoFallback();
            }
        },
        error: function(xhr, status, error) {
            console.warn('Proxy failed, trying fallback...', error);
            fetchCoinGeckoFallback();
        }
    });
}

function fetchCoinGeckoFallback() {
    $.ajax({
        url: COINGECKO_API_URL,
        method: 'GET',
        dataType: 'json',
        success: function(data) {
            cryptoData = data.map((coin) => ({
                id: coin.id,
                symbol: coin.symbol.toUpperCase(),
                name: coin.name,
                price: coin.current_price,
                change: coin.price_change_percentage_24h || 0,
                marketCap: coin.market_cap || 0,
                volume: coin.total_volume || 0,
                lastUpdated: coin.last_updated,
                source: 'CoinGecko'
            }));
            renderUI();
        },
        error: function() {
            $('#cryptoTableBody').html(`<tr><td colspan="7" class="loading" style="color:red">Failed to load market data.</td></tr>`);
        }
    });
}

function renderUI() {
    populateTable();
    updateStats();
}

// Area of change: Using jQuery each loop and string templates
function populateTable() {
    const $tableBody = $('#cryptoTableBody');
    $tableBody.empty();

    $.each(cryptoData, function(index, crypto) {
        const changeClass = crypto.change >= 0 ? 'change-positive' : 'change-negative';
        const lastUpdated = new Date(crypto.lastUpdated).toLocaleTimeString();
        
        const row = `
            <tr>
                <td>${index + 1}</td>
                <td class="pair">
                    <div class="crypto-icon">${crypto.symbol.charAt(0)}</div>
                    ${crypto.symbol} / USD
                </td>
                <td>$${formatNumber(crypto.price)}</td>
                <td class="${changeClass}">${crypto.change >= 0 ? '+' : ''}${crypto.change.toFixed(2)}%</td>
                <td>$${formatMarketCap(crypto.marketCap)}</td>
                <td>$${formatVolume(crypto.volume)}</td>
                <td style="font-size:0.75rem; color:#94a3b8">${lastUpdated} (${crypto.source})</td>
            </tr>
        `;
        $tableBody.append(row);
    });
}

// Area of change: jQuery text() and filter() usage
function updateStats() {
    $('#totalCoins').text(cryptoData.length);
    $('#positive24h').text(cryptoData.filter(c => c.change > 0).length);
    $('#negative24h').text(cryptoData.filter(c => c.change < 0).length);
    const totalCap = cryptoData.reduce((sum, c) => sum + c.marketCap, 0);
    $('#totalMarketCap').text(`$${formatMarketCap(totalCap)}`);
}

// Formatting helpers (Keep as logic)
function formatNumber(num) { return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: num < 1 ? 6 : 2 }); }
function formatMarketCap(num) { 
    if (num >= 1e12) return (num/1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num/1e9).toFixed(2) + 'B';
    return (num/1e6).toFixed(2) + 'M';
}
function formatVolume(num) { return formatMarketCap(num); }

// Area of change: jQuery event binding and filter logic
function setupFilters() {
    $('.filter-btn').on('click', function() {
        $('.filter-btn').removeClass('active');
        $(this).addClass('active');
        filterTable();
    });
    
    $('#searchInput').on('input', filterTable);
}

function filterTable() {
    const filter = $('.filter-btn.active').data('filter');
    const search = $('#searchInput').val().toLowerCase();

    $('#cryptoTableBody tr').each(function(i) {
        const symbol = cryptoData[i]?.symbol.toLowerCase() || "";
        const isPositive = cryptoData[i]?.change > 0;
        let show = symbol.includes(search);

        if (filter === 'positive' && !isPositive) show = false;
        if (filter === 'negative' && isPositive) show = false;
        if (filter === 'top10' && i >= 10) show = false;

        $(this).toggle(show);
    });
}

function setupRefreshButton() {
    const $btn = $('#refreshBtn');
    $btn.on('click', function() {
        $btn.prop('disabled', true);
        fetchCryptoData().always(() => { $btn.prop('disabled', false); });
    });
}