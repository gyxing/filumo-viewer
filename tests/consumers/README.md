# 实际消费验证

执行 pnpm run test:consumers。消费者在工作区外临时目录安装同批 tgz，验证原生、React18/19、StrictMode、Vue3、Vue2.6/2.7；不使用源码软链。报告在 tmp/testing/consumers.json，不提交本机目录。
