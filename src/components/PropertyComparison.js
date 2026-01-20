import React, { useState, useEffect } from 'react';
import PropertyComparisonDesktop from './propertycmpdesk';
import PropertyComparisonMobile from './propertycmpmobile';

const PropertyComparison = () => {
    // 1. State to track window width
    const [width, setWidth] = useState(window.innerWidth);

    // 2. Breakpoint (Standard Mobile Breakpoint is 768px)
    const breakpoint = 768;

    useEffect(() => {
        // Function to update state on resize
        const handleWindowResize = () => setWidth(window.innerWidth);

        // Add event listener
        window.addEventListener("resize", handleWindowResize);

        // Cleanup listener on unmount
        return () => window.removeEventListener("resize", handleWindowResize);
    }, []);

    // 3. Conditional Rendering
    // If screen is smaller than 768px, render Mobile Component
    // Otherwise, render Desktop Component
    return width < breakpoint ? (
        <PropertyComparisonMobile />
    ) : (
        <PropertyComparisonDesktop />
    );
};

export default PropertyComparison;