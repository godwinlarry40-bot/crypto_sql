document.addEventListener('DOMContentLoaded', function() {
    const copyButton = document.getElementById('copy-address');
    const depositAddress = document.getElementById('deposit-address');
    const cryptoTypeSelect = document.getElementById('crypto-type');
    const successMessage = document.getElementById('crypto-success');
    const qrCodeImg = document.querySelector('.qr-code img');

    // Area of change: Global Axios configuration for Grey Query
    axios.interceptors.request.use((config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    // Area of change: Fetching address from API instead of generating client-side
    cryptoTypeSelect.addEventListener('change', async function() {
        const cryptoType = this.value;
        if (!cryptoType) return;

        try {
            depositAddress.textContent = "Loading address...";
            
            // Area of change: Grey Query API Call
            const response = await axios.get(`http://localhost:5000/api/wallets/deposit-address/${cryptoType}`);
            
            if (response.data.address) {
                const newAddress = response.data.address;
                depositAddress.textContent = newAddress;
                
                // Update QR code using the real address
                qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${newAddress}`;
            }
        } catch (error) {
            console.error("Failed to fetch deposit address:", error);
            depositAddress.textContent = "Error fetching address. Try again.";
        }
    });

    // Copy to clipboard logic
    copyButton.addEventListener('click', function() {
        const address = depositAddress.textContent;
        if (address && address !== "Loading address..." && !address.includes("Error")) {
            navigator.clipboard.writeText(address).then(() => {
                successMessage.style.display = 'block';
                setTimeout(() => {
                    successMessage.style.display = 'none';
                }, 3000);
            });
        }$(document).ready(function() {
    const $copyButton = $('#copy-address');
    const $depositAddress = $('#deposit-address');
    const $cryptoTypeSelect = $('#crypto-type');
    const $successMessage = $('#crypto-success');
    const $qrCodeImg = $('.qr-code img');

    // Area of change: jQuery Global AJAX Setup (Replaces Axios Interceptor)
    // Attaches the JWT token from localStorage to the Authorization header
    $.ajaxSetup({
        beforeSend: function(xhr) {
            const token = localStorage.getItem('token');
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
        }
    });

    // Area of change: Fetching address using jQuery AJAX
    $cryptoTypeSelect.on('change', function() {
        const cryptoType = $(this).val();
        if (!cryptoType) {
            $depositAddress.text("Please select a currency");
            $qrCodeImg.attr('src', 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=SELECT_CRYPTO');
            return;
        }

        $depositAddress.text("Loading address...");
        
        // Area of change: Grey Query API Call via jQuery
        $.ajax({
            url: `http://localhost:5000/api/wallets/deposit-address/${cryptoType}`,
            type: 'GET',
            success: function(response) {
                if (response.address) {
                    const newAddress = response.address;
                    $depositAddress.text(newAddress);
                    
                    // Update QR code using the real address
                    $qrCodeImg.attr('src', `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${newAddress}`);
                }
            },
            error: function(xhr) {
                console.error("Failed to fetch deposit address:", xhr.responseJSON);
                $depositAddress.text("Error fetching address. Try again.");
            }
        });
    });

    // Area of change: Copy to clipboard logic with jQuery
    $copyButton.on('click', function() {
        const address = $depositAddress.text();
        if (address && address !== "Loading address..." && !address.includes("Error") && address !== "Please select a currency") {
            navigator.clipboard.writeText(address).then(() => {
                $successMessage.fadeIn();
                setTimeout(() => {
                    $successMessage.fadeOut();
                }, 3000);
            });
        }
    });
});
    });
});