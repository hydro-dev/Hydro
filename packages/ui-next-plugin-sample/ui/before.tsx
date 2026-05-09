export default function BeforeComponent() {
    console.log('before app');
    // throw new Error('test error boundary in before interceptor');
    return <div>before app via @hydrooj/ui-next-plugin-sample</div>;
}
