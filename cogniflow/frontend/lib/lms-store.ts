import { Course } from '../types/lms';

const COURSES_KEY = 'cogniflow_courses';

// Dispatch event on any LMS change
const dispatchUpdate = () => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cogniflow_lms_update'));
        // Also trigger Galaxy update so new course nodes appear
        window.dispatchEvent(new Event('cogniflow_update'));
    }
};

export const getCourses = (): Course[] => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(COURSES_KEY);
    return saved ? JSON.parse(saved) : [];
};

export const getCourse = (id: string): Course | null => {
    const courses = getCourses();
    return courses.find(c => c.id === id) || null;
};

export const saveCourse = (course: Course) => {
    const courses = getCourses();
    const existingIndex = courses.findIndex(c => c.id === course.id);

    if (existingIndex >= 0) {
        courses[existingIndex] = course;
    } else {
        courses.push(course);
    }

    if (typeof window !== 'undefined') {
        localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
    }
    dispatchUpdate();
};

export const deleteCourse = (id: string) => {
    const courses = getCourses().filter(c => c.id !== id);
    if (typeof window !== 'undefined') {
        localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
    }
    dispatchUpdate();
};
