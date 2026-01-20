// API Configuration
const API_BASE_URL = 'http://localhost:5000/api';
const LOGIN_ENDPOINT = `${API_BASE_URL}/auth/login`;

// ==========================================
// Area of change: Global Axios Interceptor
// Fixed 401 errors by attaching the token from localStorage
// ==========================================
axios.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

$(document).ready(function() {
    // Area of change: jQuery Toggle logic for Live vs Demo
    let loginMode = 'live';
    const $toggleOptions = $('.toggle-option');
    const $toggleSlider = $('.toggle-slider');

    $toggleOptions.on('click', function() {
        $toggleOptions.removeClass('active');
        $(this).addClass('active');
        
        loginMode = $(this).data('value');
        // Area of change: Smooth slider translation via jQuery .css()
        $toggleSlider.css('transform', loginMode === 'paper' ? 'translateX(100%)' : 'translateX(0)');
    });

    // Area of change: Password visibility toggle using jQuery
    $('#passwordToggle').on('click', function() {
        const $passInput = $('#password');
        const isPassword = $passInput.attr('type') === 'password';
        
        $passInput.attr('type', isPassword ? 'text' : 'password');
        // Area of change: Toggle icon classes
        $(this).find('i').toggleClass('fa-eye fa-eye-slash');
    });

    // Area of change: Form submission using jQuery event handling
    $('#loginForm').on('submit', async function(e) {
        e.preventDefault();

        // Target elements
        const $loginBtn = $('#loginBtn');
        const $loginError = $('#login-error'); // Added missing error div in logic
        const $successMessage = $('#login-success');
        const email = $('#username').val().trim(); // Matches HTML ID 'username'
        const password = $('#password').val();

        // Area of change: Reset UI states with jQuery
        $('.error-message, .success-message').hide().text('');

        // Visual feedback: Loading state
        $loginBtn.prop('disabled', true).text("Authenticating...");

        try {
            // Area of change: API call to Sequelize backend
            const response = await axios.post(LOGIN_ENDPOINT, {
                email: email,
                password: password,
                mode: loginMode 
            });

            if (response.data.success) {
                // Area of change: Secure local storage update
                localStorage.setItem('token', response.data.data.token);
                localStorage.setItem('user', JSON.stringify(response.data.data.user));
                localStorage.setItem('tradeMode', loginMode);

                $successMessage.fadeIn().text("Login successful! Redirecting...");
                
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1500);
            }
        } catch (error) {
            console.error("Login Error:", error.response?.data);
            
            // Area of change: Dynamic error reporting
            const errMsg = error.response?.data?.message || "Invalid email or password.";
            
            // If you don't have a #login-error div, we can use an alert or inject one
            alert(errMsg); 
            
            // Reset button state
            $loginBtn.prop('disabled', false).text("Login to Your Account");
        }
    });
});