$(document).ready(function() {
    let cacheTransactions = [];

    // START: Logic to render rows with your professional theme
    function displayData(items) {
        const $tbody = $('#history-tbody');
        if (items.length === 0) {
            $tbody.html('<tr><td colspan="5" class="text-center" style="color: var(--text-dim); padding: 40px;">No transaction records found in this category.</td></tr>');
            return;
        }

        let rows = '';
        items.forEach(tx => {
            const dateObj = new Date(tx.createdAt);
            const formattedDate = dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
            const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            // Determine color based on transaction nature
            const isCredit = ['deposit', 'investment_earning', 'referral_bonus'].includes(tx.type);
            const amountStyle = isCredit ? 'color: var(--success);' : 'color: var(--text-main);';
            const amountPrefix = isCredit ? '+' : '-';

            rows += `
                <tr>
                    <td>
                        <div>${formattedDate}</div>
                        <div style="font-size: 0.75rem; color: var(--text-dim);">${formattedTime}</div>
                    </td>
                    <td><span style="color: var(--accent-color); font-weight: 500;">${tx.type.replace('_', ' ').toUpperCase()}</span></td>
                    <td style="${amountStyle} font-weight: bold;">${amountPrefix}$${parseFloat(tx.amount).toLocaleString()}</td>
                    <td>
                        <code style="font-size: 0.8rem; color: var(--text-dim); background: rgba(255,255,255,0.05); padding: 2px 5px; border-radius: 4px;">
                            ${tx.tx_hash ? tx.tx_hash.substring(0, 12) + '...' : 'INT-' + tx.id.substring(0, 8)}
                        </code>
                    </td>
                    <td><span class="status-pill status-${tx.status}">${tx.status}</span></td>
                </tr>
            `;
        });
        $tbody.html(rows);
    }
    // END: Rendering logic

    // START: AJAX Data Fetching
    function loadHistory() {
        const token = localStorage.getItem('token');

        $.ajax({
            url: '/api/transactions/my-history',
            type: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            success: function(res) {
                if (res.success) {
                    cacheTransactions = res.data;
                    displayData(cacheTransactions);
                }
            },
            error: function(xhr) {
                $('#history-tbody').html(`<tr><td colspan="5" class="text-center" style="color: var(--danger);">Connection error (${xhr.status}). Please refresh.</td></tr>`);
            }
        });
    }

    // START: jQuery Filter Button Click Handler
    $('.filter-btn').on('click', function() {
        $('.filter-btn').removeClass('active');
        $(this).addClass('active');

        const selectedType = $(this).data('type');
        if (selectedType === 'all') {
            displayData(cacheTransactions);
        } else {
            const filtered = cacheTransactions.filter(t => t.type === selectedType);
            displayData(filtered);
        }
    });
    // END: Filter Logic

    loadHistory();
});