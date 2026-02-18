 $(document).ready(function() {
        console.log("TradePro Platform jQuery Initialized");
        
        // API Status Simulation
        setTimeout(function() {
            $('#apiStatus').removeClass('loading').addClass('connected')
                .html('<i class="fas fa-check-circle"></i> API Connected Successfully');
        }, 2000);
        
        // Sidebar Toggle Functionality
        $('#hamburgerBtn').on('click', function() {
            $('#sidebar').toggleClass('active');
            $('#sidebarOverlay').toggleClass('active');
            $('body').toggleClass('sidebar-open');
        });
        
        $('#sidebarOverlay').on('click', function() {
            $('#sidebar').removeClass('active');
            $(this).removeClass('active');
            $('body').removeClass('sidebar-open');
        });
        
        // Dropdown Menu Functionality
        $('.dropdown > .dropbtn').on('click', function(e) {
            e.preventDefault();
            $(this).siblings('.dropdown-menu').slideToggle(300);
            $(this).parent().toggleClass('open');
        });
        
        // Close dropdowns when clicking elsewhere
        $(document).on('click', function(e) {
            if (!$(e.target).closest('.dropdown').length) {
                $('.dropdown-menu').slideUp(300);
                $('.dropdown').removeClass('open');
            }
        });
        
        // Button Click Animations
        $('.btn').on('click', function() {
            $(this).addClass('clicked');
            setTimeout(function() {
                $('.btn').removeClass('clicked');
            }, 300);
        });
        
        // Feature Cards Hover Effect
        $('.feature-card').hover(
            function() {
                $(this).addClass('hover');
            },
            function() {
                $(this).removeClass('hover');
            }
        );
        
        // Image Loading Status
        $('#platformImage, #chartsImage').on('load', function() {
            $(this).addClass('loaded');
            console.log('Image loaded: ' + $(this).attr('alt'));
        }).on('error', function() {
            $(this).addClass('error');
            console.log('Error loading image: ' + $(this).attr('alt'));
        });
        
        // Footer Link Hover Effects
        $('.footer-link, .legal-link').hover(
            function() {
                $(this).addClass('hover');
            },
            function() {
                $(this).removeClass('hover');
            }
        );
        
        // Social Media Links Click Tracking
        $('.social-links a').on('click', function() {
            const platform = $(this).attr('aria-label');
            console.log('Social link clicked: ' + platform);
            // You could add analytics tracking here
        });
        
        // Get Started Button Animation
        $('#getStartedBtn').on('mouseenter', function() {
            $(this).addClass('pulse');
        }).on('mouseleave', function() {
            $(this).removeClass('pulse');
        });
        
        // Auto-update copyright year
        const currentYear = new Date().getFullYear();
        $('.copyright-section p:first-child').html('&copy; ' + currentYear + ' Trade Pro. All Rights Reserved.');
        
        // Add loading animation to market data section
        $('.market-watch').append('<div class="loading-indicator"><div class="spinner"></div><p>Loading market data...</p></div>');
        
        // Simulate market data loading
        setTimeout(function() {
            $('.loading-indicator').fadeOut(500, function() {
                $('.market-watch').append('<div class="market-data-placeholder"><h3>Market Data Available After Login</h3><p>Sign in to access real-time trading data</p></div>');
            });
        }, 3000);
        
        // Add scroll to top functionality
        $(window).on('scroll', function() {
            if ($(this).scrollTop() > 300) {
                $('.scroll-to-top').fadeIn();
            } else {
                $('.scroll-to-top').fadeOut();
            }
        });
        
        // Create scroll to top button
        $('body').append('<button class="scroll-to-top"><i class="fas fa-arrow-up"></i></button>');
        
        $('.scroll-to-top').on('click', function() {
            $('html, body').animate({scrollTop: 0}, 800);
            return false;
        });
        
        // Initialize tooltips (if you have any)
        $('[title]').tooltip();
        
        // Log page load time
        window.onload = function() {
            const loadTime = window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart;
            console.log('Page loaded in ' + loadTime + 'ms');
        };
    });
    
    // Global functions that can be called from other scripts
    window.TradePro = {
        showNotification: function(message, type = 'info') {
            const notification = $('<div class="notification ' + type + '">' + message + '</div>');
            $('body').append(notification);
            setTimeout(function() {
                notification.fadeOut(500, function() {
                    $(this).remove();
                });
            }, 3000);
        },
        
        toggleSidebar: function() {
            $('#hamburgerBtn').trigger('click');
        },
        
        updateApiStatus: function(status, message) {
            const statusEl = $('#apiStatus');
            statusEl.removeClass('loading connected error');
            statusEl.addClass(status).html(message);
        }
    };